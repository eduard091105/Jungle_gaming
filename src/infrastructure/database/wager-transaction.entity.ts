import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/core';

@Index({ name: 'wager_transactions_provider_external_idx', properties: ['providerId', 'externalTransactionId'] })
@Unique({ name: 'wager_transactions_idempotency_unique', properties: ['idempotencyKey'] })
@Unique({ name: 'wager_transactions_provider_external_unique', properties: ['providerId', 'externalTransactionId'] })
@Unique({ name: 'wager_transactions_reference_transaction_unique', properties: ['referenceTransactionId'] })
@Entity({ tableName: 'wager_transactions' })
export class WagerTransactionEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'string' })
  providerId!: string;

  @Property({ type: 'string' })
  externalTransactionId!: string;

  @Property({ type: 'string' })
  idempotencyKey!: string;

  @Property({ type: 'string' })
  payloadHash!: string;

  @Property({ type: 'uuid' })
  walletId!: string;

  @Property({ type: 'string' })
  playerId!: string;

  @Property({ type: 'string' })
  roundId!: string;

  @Property({ type: 'string' })
  gameId!: string;

  @Property({ type: 'string', length: 16 })
  kind!: string;

  @Property({ type: 'decimal', precision: 19, scale: 2 })
  amount!: string;

  @Property({ type: 'string', length: 3 })
  currency!: string;

  @Property({ type: 'string', nullable: true })
  referenceExternalTransactionId?: string;

  @Property({ type: 'string', nullable: true })
  referenceTransactionId?: string;

  @Property({ type: 'datetime' })
  createdAt = new Date();

  @Property({ type: 'string', length: 24 })
  status!: string;

  @Property({ type: 'string', nullable: true })
  failureCode?: string;

  @Property({ type: 'datetime', nullable: true })
  processedAt?: Date;
}
