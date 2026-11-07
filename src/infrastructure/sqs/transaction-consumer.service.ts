import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { SubmitTransactionRequest } from '../../wagering/transaction.dto';
import { TransactionProcessorService } from '../../wagering/transaction-processor.service';
import { SqsService } from './sqs.service';

interface WagerQueueMessage {
  messageId: string;
  idempotencyKey: string;
  request: SubmitTransactionRequest;
}

@Injectable()
export class TransactionConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TransactionConsumerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private consumeTask: Promise<void> | undefined;
  private queueUrl?: string;

  constructor(
    private readonly processor: TransactionProcessorService,
    private readonly sqsService: SqsService,
  ) {}

  onModuleInit(): void {
    if (process.env.SQS_CONSUMER_ENABLED === 'false') {
      return;
    }
    this.timer = setInterval(() => void this.consumeMessages(), 1000);
    void this.consumeMessages();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    await this.consumeTask;
  }

  async consumeMessages(): Promise<void> {
    if (!this.consumeTask) {
      this.consumeTask = this.consumeBatch().finally(() => {
        this.consumeTask = undefined;
      });
    }
    await this.consumeTask;
  }

  private async consumeBatch(): Promise<void> {
    try {
      this.queueUrl ??= await this.sqsService.getQueueUrl(
        process.env.SQS_TRANSACTION_QUEUE_NAME ?? 'wager-transactions',
        process.env.SQS_TRANSACTION_QUEUE_URL,
      );
      const messages = await this.sqsService.receiveMessages(this.queueUrl);
      for (const message of messages) {
        if (!message.Body || !message.ReceiptHandle) {
          continue;
        }
        try {
          const command = JSON.parse(message.Body) as WagerQueueMessage;
          const messageId = command.messageId ?? message.MessageId;
          if (!messageId || !command.idempotencyKey || !command.request) {
            throw new Error('Invalid wager queue message');
          }
          await this.processor.processMessage(messageId, command.request, command.idempotencyKey);
          await this.sqsService.deleteMessage(this.queueUrl, message.ReceiptHandle);
        } catch (error) {
          this.logger.error(`Wager queue message ${message.MessageId ?? 'unknown'} was not acknowledged`, error);
        }
      }
    } catch (error) {
      this.logger.error('Transaction consumer could not reach SQS', error);
    }
  }
}