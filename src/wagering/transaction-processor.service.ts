import { Injectable } from '@nestjs/common';
import { Wallet } from '../domain/wallet';
import { InboxService } from '../infrastructure/inbox/inbox.service';
import { OutboxService } from '../infrastructure/outbox/outbox.service';
import { WalletService } from '../wallets/wallet.service';
import { TransactionService } from './transaction.service';
import type { SubmitTransactionRequest, SubmitTransactionResponse } from './transaction.dto';

@Injectable()
export class TransactionProcessorService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly walletService: WalletService,
    private readonly inboxService: InboxService,
    private readonly outboxService: OutboxService,
  ) {}

  async processMessage(
    messageId: string,
    request: SubmitTransactionRequest,
    idempotencyKey: string,
  ): Promise<SubmitTransactionResponse> {
    const duplicate = await this.inboxService.isDuplicate('wager-transactions', messageId);
    const existing = await this.inboxService.markReceived('wager-transactions', messageId, request);
    if (duplicate && existing.isProcessed) {
      const prior = await this.transactionService.getByIdempotencyKey(idempotencyKey);
      if (prior) {
        return prior;
      }
    }

    const wallet = await this.walletService.findById(request.walletId);
    if (!wallet) {
      throw new Error('wallet not found');
    }

    if (!this.transactionService.usesDatabase) {
      this.transactionService.registerWallet(wallet);
    }
    const result = await this.transactionService.submit(request, idempotencyKey);

    if (!this.transactionService.usesDatabase) {
      await this.outboxService.create(
        result.status === 'REJECTED' ? 'WagerTransactionRejected' : 'WagerTransactionProcessed',
        'WagerTransaction',
        result.transactionId,
        {
        transactionId: result.transactionId,
        walletId: request.walletId,
        status: result.status,
        balance: wallet.balance.toJSON(),
          ...(result.failureCode ? { failureCode: result.failureCode } : {}),
        },
      );
    }

    await this.inboxService.markProcessed('wager-transactions', messageId);

    return result;
  }
}
