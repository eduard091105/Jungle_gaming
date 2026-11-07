import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core';

@Unique({ name: 'inbox_messages_consumer_message_unique', properties: ['consumerName', 'messageId'] })
@Entity({ tableName: 'inbox_messages' })
export class InboxMessageEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'string' })
  consumerName!: string;

  @Property({ type: 'string' })
  messageId!: string;

  @Property({ type: 'json' })
  payload!: Record<string, unknown>;

  @Property({ type: 'datetime', nullable: true })
  receivedAt?: Date;

  @Property({ type: 'datetime', nullable: true })
  processedAt?: Date;

  @Property({ type: 'integer' })
  attemptCount = 0;

  @Property({ type: 'boolean' })
  isProcessed = false;
}
