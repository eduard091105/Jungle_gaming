import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxService } from '../outbox/outbox.service';
import { SqsService } from './sqs.service';

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private timer?: ReturnType<typeof setInterval>;
  private publishTask: Promise<void> | undefined;
  private queueUrl?: string;

  constructor(
    private readonly outboxService: OutboxService,
    private readonly sqsService: SqsService,
  ) {}

  onModuleInit(): void {
    const interval = Number(process.env.OUTBOX_PUBLISH_INTERVAL_MS ?? 1000);
    this.timer = setInterval(() => void this.publishPending(), interval);
    void this.publishPending();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    await this.publishTask;
  }

  async publishPending(): Promise<void> {
    if (!this.publishTask) {
      this.publishTask = this.publishBatch().finally(() => {
        this.publishTask = undefined;
      });
    }
    await this.publishTask;
  }

  private async publishBatch(): Promise<void> {
    try {
      this.queueUrl ??= await this.sqsService.getQueueUrl(
        process.env.SQS_OUTBOX_QUEUE_NAME ?? 'wager-events',
        process.env.SQS_OUTBOX_QUEUE_URL,
      );
      for (const event of await this.outboxService.pending()) {
        try {
          await this.sqsService.sendMessage(this.queueUrl, JSON.stringify(event));
          await this.outboxService.markPublished(event.id);
        } catch (error) {
          await this.outboxService.markRetry(event.id);
          this.logger.error(`Could not publish outbox event ${event.id}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Outbox publisher could not reach SQS', error);
    }
  }
}