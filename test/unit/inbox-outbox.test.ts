import { describe, expect, test } from 'bun:test';
import { InboxService } from '../../src/infrastructure/inbox/inbox.service';
import { OutboxService } from '../../src/infrastructure/outbox/outbox.service';

describe('Inbox and Outbox', () => {
  test('deduplicates the same message by consumer and message id', async () => {
    const inbox = new InboxService();
    const first = await inbox.markReceived('wager-transactions', 'msg-1', { type: 'BET' });
    const second = await inbox.markReceived('wager-transactions', 'msg-1', { type: 'BET' });

    expect(first.messageId).toBe('msg-1');
    expect(second.messageId).toBe('msg-1');
    expect(await inbox.isDuplicate('wager-transactions', 'msg-1')).toBe(true);
  });

  test('keeps an outbox event pending until published', async () => {
    const outbox = new OutboxService();
    const created = await outbox.create('WagerTransactionProcessed', 'WagerTransaction', 'wallet-1', {
      transactionId: 'txn-1',
      status: 'PROCESSED',
    });

    expect(await outbox.pending()).toHaveLength(1);
    expect((await outbox.pending())[0]?.id).toBe(created.id);
    expect((await outbox.markPublished(created.id)).isPublished).toBe(true);
    expect(await outbox.pending()).toHaveLength(0);
  });
});
