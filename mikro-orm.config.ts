import { Options } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import {
  InboxMessageEntity,
  OutboxMessageEntity,
  WalletEntity,
  WalletLedgerEntryEntity,
  WagerTransactionEntity,
} from './src/infrastructure/database';

const config: Options = {
  driver: PostgreSqlDriver,
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'postgres',
  dbName: process.env.POSTGRES_DB ?? 'jungle',
  schema: 'public',
  entities: [
    WalletEntity,
    WagerTransactionEntity,
    WalletLedgerEntryEntity,
    InboxMessageEntity,
    OutboxMessageEntity,
  ],
  migrations: {
    tableName: 'mikro_orm_migrations',
    path: './dist/infrastructure/database/migrations',
    pathTs: './src/infrastructure/database/migrations',
    transactional: true,
  },
  allowGlobalContext: true,
  debug: process.env.NODE_ENV === 'development',
};

export default config;
