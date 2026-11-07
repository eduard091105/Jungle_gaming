import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './infrastructure/database/database.module';
import { InboxService } from './infrastructure/inbox/inbox.service';
import { OutboxService } from './infrastructure/outbox/outbox.service';
import { SqsModule } from './infrastructure/sqs/sqs.module';
import { OutboxPublisherService } from './infrastructure/sqs/outbox-publisher.service';
import { TransactionConsumerService } from './infrastructure/sqs/transaction-consumer.service';
import { TransactionProcessorService } from './wagering/transaction-processor.service';
import { TransactionController } from './wagering/transaction.controller';
import { TransactionService } from './wagering/transaction.service';
import { WalletController } from './wallets/wallet.controller';
import { WalletService } from './wallets/wallet.service';

@Module({
  imports: [DatabaseModule, SqsModule],
  controllers: [AppController, WalletController, TransactionController],
  providers: [
    AppService,
    WalletService,
    TransactionService,
    InboxService,
    OutboxService,
    TransactionProcessorService,
    OutboxPublisherService,
    TransactionConsumerService,
  ],
})
export class AppModule {}
