import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Money } from '../domain/money';
import { Wallet, WalletState } from '../domain/wallet';
import { DatabaseService } from '../infrastructure/database/database.service';
import { WalletEntity } from '../infrastructure/database/wallet.entity';
import type { CreateWalletRequest, WalletResponse } from './wallet.dto';

@Injectable()
export class WalletService {
  private readonly wallets = new Map<string, Wallet>();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  private get entityManager() {
    return this.databaseService?.entityManager;
  }

  async create(request: CreateWalletRequest): Promise<WalletResponse> {
    const wallet = Wallet.open({
      id: randomUUID(),
      playerId: request.playerId,
      initialBalance: Money.from(request.initialBalance),
    });

    const entityManager = this.entityManager?.fork();
    if (entityManager) {
      const entity = entityManager.create(WalletEntity, this.toEntityData(wallet));
      await entityManager.persistAndFlush(entity);
    } else {
      this.wallets.set(wallet.id, wallet);
    }

    return this.toResponse(wallet);
  }

  async findById(walletId: string): Promise<Wallet | undefined> {
    if (!this.entityManager) {
      return this.wallets.get(walletId);
    }

    const entity = await this.entityManager.fork().findOne(WalletEntity, { id: walletId });
    return entity ? Wallet.rehydrate(this.toState(entity)) : undefined;
  }

  async getById(walletId: string): Promise<WalletResponse | undefined> {
    const wallet = await this.findById(walletId);
    if (!wallet) {
      return undefined;
    }

    return this.toResponse(wallet);
  }

  toEntityData(wallet: Wallet): Pick<WalletEntity, 'id' | 'playerId' | 'currency' | 'balance' | 'version' | 'createdAt' | 'updatedAt' | 'playerCurrencyKey'> {
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      currency: wallet.currency,
      balance: wallet.balance.toString(),
      version: wallet.version,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
      playerCurrencyKey: `${wallet.playerId}:${wallet.currency}`,
    };
  }

  private toState(entity: WalletEntity): WalletState {
    return {
      id: entity.id,
      playerId: entity.playerId,
      currency: entity.currency,
      balance: Money.from({ amount: entity.balance, currency: entity.currency }),
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toResponse(wallet: Wallet): WalletResponse {
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
    };
  }
}
