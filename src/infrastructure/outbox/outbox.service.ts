import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { OutboxMessageEntity } from '../database/outbox-message.entity';

export interface OutboxMessageRecord {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  publishedAt?: Date;
  attemptCount: number;
  isPublished: boolean;
}

@Injectable()
export class OutboxService {
  private readonly entries = new Map<string, OutboxMessageRecord>();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  async create(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<OutboxMessageRecord> {
    const record: OutboxMessageRecord = {
      id: randomUUID(),
      eventType,
      aggregateType,
      aggregateId,
      payload,
      createdAt: new Date(),
      attemptCount: 0,
      isPublished: false,
    };

    if (this.databaseService) {
      const entityManager = this.databaseService.entityManager.fork();
      const entity = entityManager.create(OutboxMessageEntity, record);
      await entityManager.persistAndFlush(entity);
      return record;
    }

    this.entries.set(record.id, record);
    return record;
  }

  async pending(limit = 50): Promise<OutboxMessageRecord[]> {
    if (this.databaseService) {
      const entities = await this.databaseService.entityManager.fork().find(
        OutboxMessageEntity,
        { isPublished: false },
        { orderBy: { createdAt: 'ASC' }, limit },
      );
      return entities.map((entity) => this.toRecord(entity));
    }
    return [...this.entries.values()].filter((entry) => !entry.isPublished);
  }

  async markPublished(id: string): Promise<OutboxMessageRecord> {
    if (this.databaseService) {
      const entityManager = this.databaseService.entityManager.fork();
      const entity = await entityManager.findOne(OutboxMessageEntity, { id });
      if (!entity) {
        throw new Error('Outbox record not found');
      }
      entity.publishedAt = new Date();
      entity.isPublished = true;
      await entityManager.flush();
      return this.toRecord(entity);
    }

    const record = this.entries.get(id);
    if (!record) {
      throw new Error('Outbox record not found');
    }

    record.publishedAt = new Date();
    record.isPublished = true;
    return record;
  }

  async markRetry(id: string): Promise<OutboxMessageRecord> {
    if (this.databaseService) {
      const entityManager = this.databaseService.entityManager.fork();
      const entity = await entityManager.findOne(OutboxMessageEntity, { id });
      if (!entity) {
        throw new Error('Outbox record not found');
      }
      entity.attemptCount += 1;
      await entityManager.flush();
      return this.toRecord(entity);
    }

    const record = this.entries.get(id);
    if (!record) {
      throw new Error('Outbox record not found');
    }

    record.attemptCount += 1;
    return record;
  }

  private toRecord(entity: OutboxMessageEntity): OutboxMessageRecord {
    return {
      id: entity.id,
      eventType: entity.eventType,
      aggregateType: entity.aggregateType,
      aggregateId: entity.aggregateId,
      payload: entity.payload,
      createdAt: entity.createdAt,
      ...(entity.publishedAt ? { publishedAt: entity.publishedAt } : {}),
      attemptCount: entity.attemptCount,
      isPublished: entity.isPublished,
    };
  }
}
