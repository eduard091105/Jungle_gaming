import { describe, expect, test } from 'bun:test';
import { DomainError, FailureCode } from '../../src/domain/failure-code';
import { Money } from '../../src/domain/money';
import {
  LedgerDirection,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../src/domain/wager-transaction';

const money = (amount: string) => Money.from({ amount, currency: 'BRL' });

describe('WagerTransaction', () => {
  test('creates a valid bet without a reference and records the ledger direction', () => {
    const transaction = WagerTransaction.create({
      id: 't1',
      providerId: 'provider-a',
      externalTransactionId: 'ext-1',
      idempotencyKey: 'provider-a:ext-1',
      payloadHash: 'hash-1',
      walletId: 'w1',
      playerId: 'p1',
      roundId: 'r1',
      gameId: 'g1',
      kind: WagerTransactionKind.Bet,
      money: money('25.00'),
    });

    expect(transaction.status).toBe(WagerTransactionStatus.Pending);
    expect(transaction.affectsBalance()).toBe(true);
    expect(transaction.ledgerDirectionFor()).toBe(LedgerDirection.Debit);
  });

  test('requires a reference for refund and rollback requests', () => {
    expect(() =>
      WagerTransaction.create({
        id: 't2',
        providerId: 'provider-a',
        externalTransactionId: 'ext-2',
        idempotencyKey: 'provider-a:ext-2',
        payloadHash: 'hash-2',
        walletId: 'w1',
        playerId: 'p1',
        roundId: 'r1',
        gameId: 'g1',
        kind: WagerTransactionKind.Refund,
        money: money('10.00'),
      }),
    ).toThrow(new DomainError(FailureCode.InvalidReferenceKind));
  });

  test('moves a refund to pending reference and then processes it with a reference id', () => {
    const transaction = WagerTransaction.create({
      id: 't3',
      providerId: 'provider-a',
      externalTransactionId: 'ext-3',
      idempotencyKey: 'provider-a:ext-3',
      payloadHash: 'hash-3',
      walletId: 'w1',
      playerId: 'p1',
      roundId: 'r1',
      gameId: 'g1',
      kind: WagerTransactionKind.Refund,
      money: money('10.00'),
      referenceExternalTransactionId: 'ext-ref',
    });

    transaction.markPendingReference();
    expect(transaction.status).toBe(WagerTransactionStatus.PendingReference);

    transaction.markProcessed('ref-1', new Date('2026-01-01T00:00:00Z'));
    expect(transaction.status).toBe(WagerTransactionStatus.Processed);
    expect(transaction.referenceTransactionId).toBe('ref-1');
  });

  test('prevents state transitions after a terminal status has been reached', () => {
    const transaction = WagerTransaction.create({
      id: 't4',
      providerId: 'provider-a',
      externalTransactionId: 'ext-4',
      idempotencyKey: 'provider-a:ext-4',
      payloadHash: 'hash-4',
      walletId: 'w1',
      playerId: 'p1',
      roundId: 'r1',
      gameId: 'g1',
      kind: WagerTransactionKind.Bet,
      money: money('15.00'),
    });

    transaction.reject(FailureCode.InsufficientFunds);
    expect(transaction.isTerminal()).toBe(true);
    expect(() => transaction.markProcessed(undefined, new Date())).toThrow(
      new DomainError('INVALID_TRANSACTION_STATE'),
    );
  });
});
