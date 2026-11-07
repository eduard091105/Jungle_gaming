import { describe, expect, test } from 'bun:test';
import { Money } from '../../src/domain/money';
import { Wallet } from '../../src/domain/wallet';
import { TransactionService } from '../../src/wagering/transaction.service';

const money = (amount: string) => Money.from({ amount, currency: 'BRL' });

describe('TransactionService', () => {
  test('replays the original response for the same idempotency key', async () => {
    const service = new TransactionService();
    const wallet = Wallet.open({ id: 'w1', playerId: 'p1', initialBalance: money('100.00') });
    service.registerWallet(wallet);

    const first = await service.submit(
      {
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        playerId: 'p1',
        walletId: 'w1',
        roundId: 'r1',
        gameId: 'g1',
        kind: 'BET',
        money: { amount: '25.00', currency: 'BRL' },
      },
      'provider-a:ext-1',
    );

    const second = await service.submit(
      {
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        playerId: 'p1',
        walletId: 'w1',
        roundId: 'r1',
        gameId: 'g1',
        kind: 'BET',
        money: { amount: '25.00', currency: 'BRL' },
      },
      'provider-a:ext-1',
    );

    expect(first.idempotentReplay).toBe(false);
    expect(second.idempotentReplay).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);
  });

  test('records an insufficient-funds rejection without changing the wallet balance', async () => {
    const service = new TransactionService();
    const wallet = Wallet.open({ id: 'w2', playerId: 'p2', initialBalance: money('100.00') });
    service.registerWallet(wallet);
    const request = {
      providerId: 'provider-a',
      externalTransactionId: 'ext-2',
      playerId: 'p2',
      walletId: 'w2',
      roundId: 'r1',
      gameId: 'g1',
      kind: 'BET' as const,
      money: { amount: '150.00', currency: 'BRL' },
    };

    const result = await service.submit(request, 'provider-a:ext-2');
    const replay = await service.submit(request, 'provider-a:ext-2');

    expect(result.status).toBe('REJECTED');
    expect(result.failureCode).toBe('INSUFFICIENT_FUNDS');
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.transactionId).toBe(result.transactionId);
    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.version).toBe(1);
  });
});
