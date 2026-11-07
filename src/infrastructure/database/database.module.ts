import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import {
  InboxMessageEntity,
  OutboxMessageEntity,
  WalletEntity,
  WalletLedgerEntryEntity,
  WagerTransactionEntity,
} from './index';
import { DatabaseService } from './database.service';

@Module({
  imports: [
    MikroOrmModule.forRoot({
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
      },
      allowGlobalContext: true,
      debug: process.env.NODE_ENV === 'development',
    }),
  ],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
