import { describe, expect, test } from 'bun:test';
import { InboxService } from '../../src/infrastructure/inbox/inbox.service';
import { OutboxService } from '../../src/infrastructure/outbox/outbox.service';
import { TransactionProcessorService } from '../../src/wagering/transaction-processor.service';
import { TransactionService } from '../../src/wagering/transaction.service';
import { WalletService } from '../../src/wallets/wallet.service';

describe('TransactionProcessorService', () => {
  test('reuses the processed result for the same message idempotency key', async () => {
    const walletService = new WalletService();
    const transactionService = new TransactionService();
    const inboxService = new InboxService();
    const outboxService = new OutboxService();
    const wallet = await walletService.create({
      playerId: 'p1',
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const processor = new TransactionProcessorService(
      transactionService,
      walletService,
      inboxService,
      outboxService,
    );

    const first = await processor.processMessage('msg-1', {
      providerId: 'provider-a',
      externalTransactionId: 'ext-1',
      playerId: 'p1',
      walletId: wallet.id,
      roundId: 'r1',
      gameId: 'g1',
      kind: 'BET',
      money: { amount: '30.00', currency: 'BRL' },
    }, 'key-1');

    const second = await processor.processMessage('msg-1', {
      providerId: 'provider-a',
      externalTransactionId: 'ext-1',
      playerId: 'p1',
      walletId: wallet.id,
      roundId: 'r1',
      gameId: 'g1',
      kind: 'BET',
      money: { amount: '30.00', currency: 'BRL' },
    }, 'key-1');

    expect(first.transactionId).toBe(second.transactionId);
    expect(second.idempotentReplay).toBe(true);
    expect((await walletService.getById(wallet.id))?.balance.amount).toBe('70.00');
  });
});
