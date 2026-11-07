import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/core';

@Index({ name: 'wallet_ledger_entries_wallet_idx', properties: ['walletId', 'createdAt'] })
@Unique({ name: 'wallet_ledger_transaction_unique', properties: ['transactionId'] })
@Entity({ tableName: 'wallet_ledger_entries' })
export class WalletLedgerEntryEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'uuid' })
  walletId!: string;

  @Property({ type: 'uuid' })
  transactionId!: string;

  @Property({ type: 'string', length: 10 })
  direction!: string;

  @Property({ type: 'decimal', precision: 19, scale: 2 })
  amount!: string;

  @Property({ type: 'string', length: 3 })
  currency!: string;

  @Property({ type: 'decimal', precision: 19, scale: 2 })
  balanceBefore!: string;

  @Property({ type: 'decimal', precision: 19, scale: 2 })
  balanceAfter!: string;

  @Property({ type: 'datetime' })
  createdAt = new Date();
}
