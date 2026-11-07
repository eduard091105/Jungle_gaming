import { LockMode } from '@mikro-orm/core';
import { Injectable, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DomainError, FailureCode } from '../domain/failure-code';
import { Money } from '../domain/money';
import { WalletLedgerEntry } from '../domain/wallet-ledger-entry';
import {
  LedgerDirection,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../domain/wager-transaction';
import { Wallet } from '../domain/wallet';
import {
  OutboxMessageEntity,
  WalletEntity,
  WalletLedgerEntryEntity,
  WagerTransactionEntity,
} from '../infrastructure/database';
import { DatabaseService } from '../infrastructure/database/database.service';
import type { SubmitTransactionRequest, SubmitTransactionResponse } from './transaction.dto';

type DomainTransactionKind = Exclude<WagerTransactionKind, WagerTransactionKind.Opening>;

@Injectable()
export class TransactionService {
  private readonly transactions = new Map<string, WagerTransaction>();
  private readonly idempotencyKeys = new Map<string, string>();
  private readonly wallets = new Map<string, Wallet>();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  private get entityManager() {
    return this.databaseService?.entityManager;
  }

  get usesDatabase(): boolean {
    return this.entityManager !== undefined;
  }

  registerWallet(wallet: Wallet): void {
    this.wallets.set(wallet.id, wallet);
  }

  async submit(
    request: SubmitTransactionRequest,
    idempotencyKey: string,
  ): Promise<SubmitTransactionResponse> {
    if (this.entityManager) {
      return this.submitPersisted(request, idempotencyKey);
    }

    return this.submitInMemory(request, idempotencyKey);
  }

  async getByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<SubmitTransactionResponse | undefined> {
    if (this.entityManager) {
      const entityManager = this.entityManager.fork();
      const transaction = await entityManager.findOne(WagerTransactionEntity, { idempotencyKey });
      return transaction ? this.responseFromEntity(entityManager, transaction, true) : undefined;
    }

    const existing = this.idempotencyKeys.get(idempotencyKey);
    if (existing) {
      const transaction = this.transactions.get(existing);
      if (!transaction) {
        throw new Error('missing transaction for idempotency key');
      }

      const wallet = this.wallets.get(transaction.walletId);
      const balance = wallet?.balance.toJSON() ?? { amount: '0.00', currency: 'BRL' };

      return {
        transactionId: transaction.id,
        status: transaction.status,
        balance,
        idempotentReplay: true,
        ...(transaction.failureCode ? { failureCode: transaction.failureCode } : {}),
      };
    }

    return undefined;
  }

  private async submitPersisted(
    request: SubmitTransactionRequest,
    idempotencyKey: string,
  ): Promise<SubmitTransactionResponse> {
    const rootEntityManager = this.entityManager;
    if (!rootEntityManager) {
      throw new Error('database entity manager is not configured');
    }

    const hash = payloadHash(request);
    try {
      return await rootEntityManager.fork().transactional(async (entityManager) => {
        const existing = await this.findExistingTransaction(entityManager, request, idempotencyKey);
        if (existing) {
          this.assertSamePayload(existing.payloadHash, hash);
          return this.responseFromEntity(entityManager, existing, true);
        }

        const walletEntity = await entityManager.findOne(
          WalletEntity,
          { id: request.walletId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!walletEntity) {
          throw new Error('wallet not found');
        }
        if (walletEntity.playerId !== request.playerId) {
          throw new Error('PLAYER_MISMATCH');
        }
        if (walletEntity.currency !== request.money.currency) {
          throw new Error('CURRENCY_MISMATCH');
        }

        const wallet = Wallet.rehydrate({
          id: walletEntity.id,
          playerId: walletEntity.playerId,
          currency: walletEntity.currency,
          balance: Money.from({ amount: walletEntity.balance, currency: walletEntity.currency }),
          version: walletEntity.version,
          createdAt: walletEntity.createdAt,
          updatedAt: walletEntity.updatedAt,
        });
        const referenceEntity = await this.findReference(entityManager, request);
        const transactionProps: Parameters<typeof WagerTransaction.create>[0] = {
          id: randomUUID(),
          providerId: request.providerId,
          externalTransactionId: request.externalTransactionId,
          idempotencyKey,
          payloadHash: hash,
          walletId: request.walletId,
          playerId: request.playerId,
          roundId: request.roundId,
          gameId: request.gameId,
          kind: request.kind as DomainTransactionKind,
          money: Money.from(request.money),
        };
        if (request.referenceExternalTransactionId !== undefined) {
          transactionProps.referenceExternalTransactionId = request.referenceExternalTransactionId;
        }

        const transaction = WagerTransaction.create(transactionProps);
        const reference = referenceEntity ? this.rehydrateTransaction(referenceEntity) : undefined;
        const before = wallet.balance;
        let direction: LedgerDirection | undefined;
        try {
          direction = this.applyMovement(transaction, reference, wallet);
        } catch (error) {
          const failureCode = domainFailureCode(error);
          if (!failureCode) {
            throw error;
          }
          transaction.reject(failureCode);
          const rejectedAt = new Date();
          entityManager.persist(this.createTransactionEntity(entityManager, transaction, referenceEntity, rejectedAt));
          entityManager.persist(
            this.createOutboxEntity(entityManager, transaction, wallet, rejectedAt, failureCode),
          );
          await entityManager.flush();
          return {
            transactionId: transaction.id,
            status: transaction.status,
            balance: before.toJSON(),
            idempotentReplay: false,
            failureCode,
          };
        }
        const processedAt = new Date();
        transaction.markProcessed(referenceEntity?.id, processedAt);

        walletEntity.balance = wallet.balance.toString();
        walletEntity.version = wallet.version;
        walletEntity.updatedAt = wallet.updatedAt;

        const transactionEntity = this.createTransactionEntity(
          entityManager,
          transaction,
          referenceEntity,
          processedAt,
        );
        entityManager.persist([walletEntity, transactionEntity]);

        if (direction) {
          const ledgerEntry = WalletLedgerEntry.create({
            id: randomUUID(),
            walletId: wallet.id,
            transactionId: transaction.id,
            direction,
            money: transaction.money,
            balanceBefore: before,
            balanceAfter: wallet.balance,
            createdAt: processedAt,
          });
          entityManager.persist(
            entityManager.create(WalletLedgerEntryEntity, {
              id: ledgerEntry.id,
              walletId: ledgerEntry.walletId,
              transactionId: ledgerEntry.transactionId,
              direction: ledgerEntry.direction,
              amount: ledgerEntry.money.toString(),
              currency: ledgerEntry.money.currency,
              balanceBefore: ledgerEntry.balanceBefore.toString(),
              balanceAfter: ledgerEntry.balanceAfter.toString(),
              createdAt: ledgerEntry.createdAt,
            }),
          );
        }

        entityManager.persist(this.createOutboxEntity(entityManager, transaction, wallet, processedAt));
        await entityManager.flush();

        return {
          transactionId: transaction.id,
          status: transaction.status,
          balance: wallet.balance.toJSON(),
          idempotentReplay: false,
        };
      });
    } catch (error) {
      const retryEntityManager = rootEntityManager.fork();
      const existing = await this.findExistingTransaction(retryEntityManager, request, idempotencyKey);
      if (existing) {
        this.assertSamePayload(existing.payloadHash, hash);
        return this.responseFromEntity(retryEntityManager, existing, true);
      }
      throw error;
    }
  }

  private submitInMemory(
    request: SubmitTransactionRequest,
    idempotencyKey: string,
  ): SubmitTransactionResponse {
    const hash = payloadHash(request);
    const existing = this.idempotencyKeys.get(idempotencyKey);
    if (existing) {
      const transaction = this.transactions.get(existing);
      if (!transaction) {
        throw new Error('missing transaction for idempotency key');
      }
      this.assertSamePayload(transaction.payloadHash, hash);
      return this.responseFromWallet(transaction, true);
    }

    const externalExisting = [...this.transactions.values()].find(
      (item) => item.providerId === request.providerId && item.externalTransactionId === request.externalTransactionId,
    );
    if (externalExisting) {
      this.assertSamePayload(externalExisting.payloadHash, hash);
      this.idempotencyKeys.set(idempotencyKey, externalExisting.id);
      return this.responseFromWallet(externalExisting, true);
    }

    const wallet = this.wallets.get(request.walletId);
    if (!wallet) {
      throw new Error('wallet not found');
    }
    if (wallet.playerId !== request.playerId) {
      throw new Error('PLAYER_MISMATCH');
    }
    if (wallet.currency !== request.money.currency) {
      throw new Error('CURRENCY_MISMATCH');
    }

    const transactionProps: Parameters<typeof WagerTransaction.create>[0] = {
      id: randomUUID(),
      providerId: request.providerId,
      externalTransactionId: request.externalTransactionId,
      idempotencyKey: idempotencyKey,
      payloadHash: hash,
      walletId: request.walletId,
      playerId: request.playerId,
      roundId: request.roundId,
      gameId: request.gameId,
      kind: request.kind as DomainTransactionKind,
      money: Money.from(request.money),
    };

    if (request.referenceExternalTransactionId !== undefined) {
      transactionProps.referenceExternalTransactionId = request.referenceExternalTransactionId;
    }

    const transaction = WagerTransaction.create(transactionProps);
    const reference = request.referenceExternalTransactionId
      ? [...this.transactions.values()].find(
          (item) => item.providerId === request.providerId && item.externalTransactionId === request.referenceExternalTransactionId,
        )
      : undefined;
    if (request.referenceExternalTransactionId && !reference) {
      throw new Error('REFERENCE_NOT_FOUND');
    }
    const before = wallet.balance;
    let direction: LedgerDirection | undefined;
    try {
      direction = this.applyMovement(transaction, reference, wallet);
    } catch (error) {
      const failureCode = domainFailureCode(error);
      if (!failureCode) {
        throw error;
      }
      transaction.reject(failureCode);
      this.transactions.set(transaction.id, transaction);
      this.idempotencyKeys.set(idempotencyKey, transaction.id);
      return {
        transactionId: transaction.id,
        status: transaction.status,
        balance: before.toJSON(),
        idempotentReplay: false,
        failureCode,
      };
    }
    transaction.markProcessed(reference?.id, new Date());
    this.transactions.set(transaction.id, transaction);
    this.idempotencyKeys.set(idempotencyKey, transaction.id);
    if (direction) {
      void WalletLedgerEntry.create({
        id: randomUUID(),
        walletId: wallet.id,
        transactionId: transaction.id,
        direction,
        money: transaction.money,
        balanceBefore: before,
        balanceAfter: wallet.balance,
      });
    }
    return this.responseFromWallet(transaction, false);
  }

  private async findReference(
    entityManager: NonNullable<DatabaseService['entityManager']>,
    request: SubmitTransactionRequest,
  ): Promise<WagerTransactionEntity | undefined> {
    if (!request.referenceExternalTransactionId) {
      return undefined;
    }

    const reference = await entityManager.findOne(WagerTransactionEntity, {
      providerId: request.providerId,
      externalTransactionId: request.referenceExternalTransactionId,
    });
    if (!reference) {
      throw new Error('REFERENCE_NOT_FOUND');
    }
    if (reference.status !== WagerTransactionStatus.Processed) {
      throw new Error('REFERENCE_NOT_PROCESSED');
    }
    const alreadyReversed = await entityManager.findOne(WagerTransactionEntity, {
      referenceTransactionId: reference.id,
      status: WagerTransactionStatus.Processed,
    });
    if (alreadyReversed) {
      throw new Error('REFERENCE_ALREADY_REVERSED');
    }
    if (reference.walletId !== request.walletId || reference.playerId !== request.playerId) {
      throw new Error('PLAYER_MISMATCH');
    }
    if (reference.amount !== Money.from(request.money).toString() || reference.currency !== request.money.currency) {
      throw new Error('REFERENCE_AMOUNT_MISMATCH');
    }
    return reference;
  }

  private rehydrateTransaction(entity: WagerTransactionEntity): WagerTransaction {
    return WagerTransaction.rehydrate({
      id: entity.id,
      providerId: entity.providerId,
      externalTransactionId: entity.externalTransactionId,
      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash,
      walletId: entity.walletId,
      playerId: entity.playerId,
      roundId: entity.roundId,
      gameId: entity.gameId,
      kind: entity.kind as DomainTransactionKind,
      money: Money.from({ amount: entity.amount, currency: entity.currency }),
      createdAt: entity.createdAt,
      status: entity.status as WagerTransactionStatus,
      ...(entity.referenceExternalTransactionId
        ? { referenceExternalTransactionId: entity.referenceExternalTransactionId }
        : {}),
      ...(entity.referenceTransactionId ? { referenceTransactionId: entity.referenceTransactionId } : {}),
      ...(entity.failureCode ? { failureCode: entity.failureCode as never } : {}),
      ...(entity.processedAt ? { processedAt: entity.processedAt } : {}),
    });
  }

  private findExistingTransaction(
    entityManager: NonNullable<DatabaseService['entityManager']>,
    request: SubmitTransactionRequest,
    idempotencyKey: string,
  ): Promise<WagerTransactionEntity | null> {
    return entityManager.findOne(WagerTransactionEntity, {
      $or: [
        { idempotencyKey },
        {
          providerId: request.providerId,
          externalTransactionId: request.externalTransactionId,
        },
      ],
    });
  }

  private createTransactionEntity(
    entityManager: NonNullable<DatabaseService['entityManager']>,
    transaction: WagerTransaction,
    reference: WagerTransactionEntity | undefined,
    at: Date,
  ): WagerTransactionEntity {
    return entityManager.create(WagerTransactionEntity, {
      id: transaction.id,
      providerId: transaction.providerId,
      externalTransactionId: transaction.externalTransactionId,
      idempotencyKey: transaction.idempotencyKey,
      payloadHash: transaction.payloadHash,
      walletId: transaction.walletId,
      playerId: transaction.playerId,
      roundId: transaction.roundId,
      gameId: transaction.gameId,
      kind: transaction.kind,
      amount: transaction.money.toString(),
      currency: transaction.money.currency,
      createdAt: transaction.createdAt,
      status: transaction.status,
      ...(transaction.failureCode ? { failureCode: transaction.failureCode } : {}),
      ...(transaction.isTerminal() ? { processedAt: at } : {}),
      ...(transaction.referenceExternalTransactionId
        ? { referenceExternalTransactionId: transaction.referenceExternalTransactionId }
        : {}),
      ...(reference ? { referenceTransactionId: reference.id } : {}),
    });
  }

  private createOutboxEntity(
    entityManager: NonNullable<DatabaseService['entityManager']>,
    transaction: WagerTransaction,
    wallet: Wallet,
    at: Date,
    failureCode?: FailureCode,
  ): OutboxMessageEntity {
    return entityManager.create(OutboxMessageEntity, {
      id: randomUUID(),
      eventType: failureCode ? 'WagerTransactionRejected' : 'WagerTransactionProcessed',
      aggregateType: 'WagerTransaction',
      aggregateId: transaction.id,
      payload: {
        transactionId: transaction.id,
        walletId: wallet.id,
        status: transaction.status,
        balance: wallet.balance.toJSON(),
        ...(failureCode ? { failureCode } : {}),
      },
      createdAt: at,
      attemptCount: 0,
      isPublished: false,
    });
  }

  private applyMovement(
    transaction: WagerTransaction,
    reference: WagerTransaction | undefined,
    wallet: Wallet,
  ): LedgerDirection | undefined {
    switch (transaction.kind) {
      case WagerTransactionKind.Bet:
        wallet.debit(transaction.money);
        break;
      case WagerTransactionKind.Win:
      case WagerTransactionKind.Refund:
        wallet.credit(transaction.money);
        break;
      case WagerTransactionKind.Rollback: {
        const direction = transaction.ledgerDirectionFor(reference);
        if (direction === LedgerDirection.Credit) {
          wallet.credit(transaction.money);
        } else {
          wallet.debit(transaction.money);
        }
        return direction;
      }
      case WagerTransactionKind.Loss:
        return undefined;
    }
    return transaction.ledgerDirectionFor(reference);
  }

  private async responseFromEntity(
    entityManager: NonNullable<DatabaseService['entityManager']>,
    transaction: WagerTransactionEntity,
    idempotentReplay: boolean,
  ): Promise<SubmitTransactionResponse> {
    const wallet = await entityManager.findOne(WalletEntity, { id: transaction.walletId });
    if (!wallet) {
      throw new Error('wallet not found');
    }
    return {
      transactionId: transaction.id,
      status: transaction.status,
      balance: { amount: wallet.balance, currency: wallet.currency },
      idempotentReplay,
      ...(transaction.failureCode ? { failureCode: transaction.failureCode } : {}),
    };
  }

  private responseFromWallet(
    transaction: WagerTransaction,
    idempotentReplay: boolean,
  ): SubmitTransactionResponse {
    const wallet = this.wallets.get(transaction.walletId);
    return {
      transactionId: transaction.id,
      status: transaction.status,
      balance: wallet?.balance.toJSON() ?? { amount: '0.00', currency: transaction.money.currency },
      idempotentReplay,
      ...(transaction.failureCode ? { failureCode: transaction.failureCode } : {}),
    };
  }

  private assertSamePayload(storedHash: string, requestedHash: string): void {
    if (storedHash !== requestedHash) {
      throw new Error('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD');
    }
  }
}

function domainFailureCode(error: unknown): FailureCode | undefined {
  const code = error instanceof DomainError ? error.code : error instanceof Error ? error.message : undefined;
  return Object.values(FailureCode).find((candidate) => candidate === code);
}

function payloadHash(request: SubmitTransactionRequest): string {
  return createHash('sha256')
    .update(JSON.stringify({
      providerId: request.providerId,
      externalTransactionId: request.externalTransactionId,
      playerId: request.playerId,
      walletId: request.walletId,
      roundId: request.roundId,
      gameId: request.gameId,
      kind: request.kind,
      money: request.money,
      referenceExternalTransactionId: request.referenceExternalTransactionId ?? null,
    }))
    .digest('hex');
}
