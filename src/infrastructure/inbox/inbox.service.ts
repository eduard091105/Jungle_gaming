import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { InboxMessageEntity } from '../database/inbox-message.entity';

export interface InboxMessageRecord {
  consumerName: string;
  messageId: string;
  payload: unknown;
  processedAt?: Date;
  isProcessed: boolean;
}

@Injectable()
export class InboxService {
  private readonly entries = new Map<string, InboxMessageRecord>();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  async isDuplicate(consumerName: string, messageId: string): Promise<boolean> {
    if (this.databaseService) {
      return (await this.databaseService.entityManager.count(InboxMessageEntity, {
        consumerName,
        messageId,
      })) > 0;
    }
    return this.entries.has(this.key(consumerName, messageId));
  }

  async markReceived(
    consumerName: string,
    messageId: string,
    payload: unknown,
  ): Promise<InboxMessageRecord> {
    if (this.databaseService) {
      const entityManager = this.databaseService.entityManager.fork();
      const existing = await entityManager.findOne(InboxMessageEntity, { consumerName, messageId });
      if (existing) {
        existing.attemptCount += 1;
        await entityManager.flush();
        return this.toRecord(existing);
      }

      const entity = entityManager.create(InboxMessageEntity, {
        id: randomUUID(),
        consumerName,
        messageId,
        payload: payload as Record<string, unknown>,
        receivedAt: new Date(),
        attemptCount: 1,
        isProcessed: false,
      });
      try {
        await entityManager.persistAndFlush(entity);
        return this.toRecord(entity);
      } catch (error) {
        const retryEntityManager = this.databaseService.entityManager.fork();
        const duplicate = await retryEntityManager.findOne(InboxMessageEntity, { consumerName, messageId });
        if (!duplicate) {
          throw error;
        }
        duplicate.attemptCount += 1;
        await retryEntityManager.flush();
        return this.toRecord(duplicate);
      }
    }

    const key = this.key(consumerName, messageId);
    const existing = this.entries.get(key);
    if (existing) {
      return existing;
    }

    const record: InboxMessageRecord = {
      consumerName,
      messageId,
      payload,
      isProcessed: false,
    };

    this.entries.set(key, record);
    return record;
  }

  async markProcessed(consumerName: string, messageId: string): Promise<InboxMessageRecord> {
    if (this.databaseService) {
      const entityManager = this.databaseService.entityManager.fork();
      const entity = await entityManager.findOne(InboxMessageEntity, {
        consumerName,
        messageId,
      });
      if (!entity) {
        throw new Error('Inbox record not found');
      }

      entity.processedAt = new Date();
      entity.isProcessed = true;
      await entityManager.flush();
      return this.toRecord(entity);
    }

    const key = this.key(consumerName, messageId);
    const record = this.entries.get(key);
    if (!record) {
      throw new Error('Inbox record not found');
    }

    record.processedAt = new Date();
    record.isProcessed = true;
    return record;
  }

  private key(consumerName: string, messageId: string): string {
    return `${consumerName}:${messageId}`;
  }

  private toRecord(entity: InboxMessageEntity): InboxMessageRecord {
    return {
      consumerName: entity.consumerName,
      messageId: entity.messageId,
      payload: entity.payload,
      ...(entity.processedAt ? { processedAt: entity.processedAt } : {}),
      isProcessed: entity.isProcessed,
    };
  }
}
