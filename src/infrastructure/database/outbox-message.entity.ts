import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/core';

@Index({ name: 'outbox_messages_event_type_idx', properties: ['eventType', 'isPublished', 'createdAt'] })
@Entity({ tableName: 'outbox_messages' })
export class OutboxMessageEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'string' })
  eventType!: string;

  @Property({ type: 'string' })
  aggregateType!: string;

  @Property({ type: 'uuid' })
  aggregateId!: string;

  @Property({ type: 'json' })
  payload!: Record<string, unknown>;

  @Property({ type: 'datetime' })
  createdAt = new Date();

  @Property({ type: 'datetime', nullable: true })
  publishedAt?: Date;

  @Property({ type: 'integer' })
  attemptCount = 0;

  @Property({ type: 'boolean' })
  isPublished = false;
}
