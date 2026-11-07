import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MikroORM } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import ormConfig from '../../mikro-orm.config';
import { AppModule } from '../../src/app.module';
import { DatabaseService } from '../../src/infrastructure/database/database.service';
import { InboxMessageEntity } from '../../src/infrastructure/database/inbox-message.entity';
import { OutboxMessageEntity } from '../../src/infrastructure/database/outbox-message.entity';
import { WalletLedgerEntryEntity } from '../../src/infrastructure/database/wallet-ledger-entry.entity';
import { WagerTransactionEntity } from '../../src/infrastructure/database/wager-transaction.entity';
import { OutboxPublisherService } from '../../src/infrastructure/sqs/outbox-publisher.service';
import { SqsService } from '../../src/infrastructure/sqs/sqs.service';
import { TransactionConsumerService } from '../../src/infrastructure/sqs/transaction-consumer.service';
import { TransactionService } from '../../src/wagering/transaction.service';
import { WalletService } from '../../src/wallets/wallet.service';

const integrationEnabled = process.env.RUN_INTEGRATION_TESTS === 'true';
let testApp: INestApplicationContext;

describe.skipIf(!integrationEnabled)('PostgreSQL and SQS integration', () => {
  beforeAll(async () => {
    process.env.SQS_ENDPOINT_URL ??= 'http://localhost:4566';
    process.env.SQS_CONSUMER_ENABLED = 'false';
    process.env.SQS_TRANSACTION_QUEUE_NAME = 'wager-transactions-integration';

    const orm = await MikroORM.init(ormConfig);
    try {
      await orm.getMigrator().up();
    } finally {
      await orm.close(true);
    }

    testApp = await NestFactory.createApplicationContext(AppModule);
  });

  afterAll(async () => {
    await testApp?.close();
  });

  test('persists a queued wager once and publishes its outbox event', async () => {
    const suffix = randomUUID();
    const wallets = testApp.get(WalletService);
    const sqs = testApp.get(SqsService);
    const database = testApp.get(DatabaseService);
    const wallet = await wallets.create({
      playerId: `integration-${suffix}`,
      initialBalance: { amount: '20.00', currency: 'BRL' },
    });
    const message = {
      messageId: `message-${suffix}`,
      idempotencyKey: `idempotency-${suffix}`,
      request: {
        providerId: 'integration-provider',
        externalTransactionId: `external-${suffix}`,
        playerId: wallet.playerId,
        walletId: wallet.id,
        roundId: 'integration-round',
        gameId: 'integration-game',
        kind: 'BET' as const,
        money: { amount: '3.50', currency: 'BRL' },
      },
    };
    const transactionQueueUrl = await sqs.getQueueUrl(process.env.SQS_TRANSACTION_QUEUE_NAME!);
    await sqs.sendMessage(transactionQueueUrl, JSON.stringify(message));
    await testApp.get(TransactionConsumerService).consumeMessages();

    const loadedWallet = await wallets.getById(wallet.id);
    const entityManager = database.entityManager.fork();
    const transaction = await entityManager.findOne(WagerTransactionEntity, {
      idempotencyKey: message.idempotencyKey,
    });
    expect(loadedWallet?.balance.amount).toBe('16.50');
    expect(transaction?.status).toBe('PROCESSED');
    expect(await entityManager.count(WalletLedgerEntryEntity, { transactionId: transaction!.id })).toBe(1);
    expect(await entityManager.count(InboxMessageEntity, {
      consumerName: 'wager-transactions',
      messageId: message.messageId,
      isProcessed: true,
    })).toBe(1);

    await sqs.sendMessage(transactionQueueUrl, JSON.stringify(message));
    await testApp.get(TransactionConsumerService).consumeMessages();
    expect((await wallets.getById(wallet.id))?.balance.amount).toBe('16.50');
    expect(await entityManager.count(WagerTransactionEntity, {
      idempotencyKey: message.idempotencyKey,
    })).toBe(1);
    expect(await entityManager.count(WalletLedgerEntryEntity, { transactionId: transaction!.id })).toBe(1);

    await testApp.get(OutboxPublisherService).publishPending();
    const eventQueueUrl = await sqs.getQueueUrl('wager-events');
    const events = await sqs.receiveMessages(eventQueueUrl, 10);
    const event = events.find((item) => {
      if (!item.Body) return false;
      return (JSON.parse(item.Body) as { aggregateId?: string }).aggregateId === transaction!.id;
    });
    expect(event).toBeDefined();
    for (const item of events) {
      if (item.ReceiptHandle) {
        await sqs.deleteMessage(eventQueueUrl, item.ReceiptHandle);
      }
    }
    const outbox = await entityManager.findOne(OutboxMessageEntity, {
      aggregateId: transaction!.id,
      isPublished: true,
    });
    expect(outbox).toBeDefined();
  });

  test('serializes concurrent replays without a second debit', async () => {
    const suffix = randomUUID();
    const wallets = testApp.get(WalletService);
    const transactions = testApp.get(TransactionService);
    const wallet = await wallets.create({
      playerId: `concurrent-${suffix}`,
      initialBalance: { amount: '12.00', currency: 'BRL' },
    });
    const request = {
      providerId: 'concurrent-provider',
      externalTransactionId: `external-${suffix}`,
      playerId: wallet.playerId,
      walletId: wallet.id,
      roundId: 'concurrent-round',
      gameId: 'concurrent-game',
      kind: 'BET' as const,
      money: { amount: '4.00', currency: 'BRL' },
    };

    const results = await Promise.all([
      transactions.submit(request, `concurrent-idem-${suffix}`),
      transactions.submit(request, `concurrent-idem-${suffix}`),
    ]);
    const loadedWallet = await wallets.getById(wallet.id);
    expect(results[0]?.transactionId).toBe(results[1]?.transactionId);
    expect(results.filter((result) => result.idempotentReplay)).toHaveLength(1);
    expect(loadedWallet?.balance.amount).toBe('8.00');
  });

  test('persists and acknowledges permanent insufficient-funds rejections', async () => {
    const suffix = randomUUID();
    const wallets = testApp.get(WalletService);
    const sqs = testApp.get(SqsService);
    const database = testApp.get(DatabaseService);
    const wallet = await wallets.create({
      playerId: `rejected-${suffix}`,
      initialBalance: { amount: '1.00', currency: 'BRL' },
    });
    const message = {
      messageId: `rejected-message-${suffix}`,
      idempotencyKey: `rejected-idem-${suffix}`,
      request: {
        providerId: 'rejection-provider',
        externalTransactionId: `rejected-external-${suffix}`,
        playerId: wallet.playerId,
        walletId: wallet.id,
        roundId: 'rejection-round',
        gameId: 'rejection-game',
        kind: 'BET' as const,
        money: { amount: '2.00', currency: 'BRL' },
      },
    };
    const queueUrl = await sqs.getQueueUrl(process.env.SQS_TRANSACTION_QUEUE_NAME!);
    await sqs.sendMessage(queueUrl, JSON.stringify(message));
    await testApp.get(TransactionConsumerService).consumeMessages();

    const entityManager = database.entityManager.fork();
    const transaction = await entityManager.findOne(WagerTransactionEntity, {
      idempotencyKey: message.idempotencyKey,
    });
    const inbox = await entityManager.findOne(InboxMessageEntity, {
      consumerName: 'wager-transactions',
      messageId: message.messageId,
    });
    const remaining = await sqs.receiveMessages(queueUrl, 10, 0);
    expect(transaction?.status).toBe('REJECTED');
    expect(transaction?.failureCode).toBe('INSUFFICIENT_FUNDS');
    expect(inbox?.isProcessed).toBe(true);
    expect((await wallets.getById(wallet.id))?.balance.amount).toBe('1.00');
    expect(await entityManager.count(WalletLedgerEntryEntity, { transactionId: transaction!.id })).toBe(0);
    expect(remaining).toHaveLength(0);
  });

  test('serves persisted wallet and wager data through the HTTP API', async () => {
    const api = await NestFactory.create(AppModule, { logger: false });
    await api.listen(0, '127.0.0.1');
    const address = api.getHttpServer().address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const walletResponse = await fetch(`${baseUrl}/wallets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          playerId: `http-${randomUUID()}`,
          initialBalance: { amount: '15.00', currency: 'BRL' },
        }),
      });
      expect(walletResponse.status).toBe(201);
      const wallet = (await walletResponse.json()) as {
        id: string;
        playerId: string;
        balance: { amount: string; currency: string };
      };
      const request = {
        providerId: 'http-integration',
        externalTransactionId: `external-${randomUUID()}`,
        playerId: wallet.playerId,
        walletId: wallet.id,
        roundId: 'http-round',
        gameId: 'http-game',
        kind: 'BET',
        money: { amount: '2.50', currency: 'BRL' },
      };
      const headers = {
        'content-type': 'application/json',
        'idempotency-key': `http-idem-${randomUUID()}`,
      };
      const firstResponse = await fetch(`${baseUrl}/wagering/transactions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });
      const first = (await firstResponse.json()) as { status: string; transactionId: string };
      const replayResponse = await fetch(`${baseUrl}/wagering/transactions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });
      const replay = (await replayResponse.json()) as { idempotentReplay: boolean };
      const loaded = await fetch(`${baseUrl}/wallets/${wallet.id}`);
      const persistedWallet = (await loaded.json()) as { balance: { amount: string } };

      expect(firstResponse.status).toBe(201);
      expect(first.status).toBe('PROCESSED');
      expect(replay.idempotentReplay).toBe(true);
      expect(persistedWallet.balance.amount).toBe('12.50');
    } finally {
      await api.close();
    }
  });
});
