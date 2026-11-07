import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core';

@Unique({ name: 'wallets_player_currency_unique', properties: ['playerId', 'currency'] })
@Entity({ tableName: 'wallets' })
export class WalletEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'string' })
  playerId!: string;

  @Property({ type: 'string', length: 3 })
  currency!: string;

  @Property({ type: 'decimal', precision: 19, scale: 2 })
  balance!: string;

  @Property({ type: 'integer' })
  version = 1;

  @Property({ type: 'datetime' })
  createdAt = new Date();

  @Property({ type: 'datetime' })
  updatedAt = new Date();

  @Unique({ name: 'wallets_player_currency_unique' })
  @Property({ type: 'string' })
  playerCurrencyKey!: string;
}
