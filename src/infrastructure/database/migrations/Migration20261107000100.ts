import { Migration } from '@mikro-orm/migrations';

export class Migration20261107000100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'create unique index if not exists wager_transactions_provider_external_unique on wager_transactions (provider_id, external_transaction_id)',
    );
    this.addSql(
      'create unique index if not exists wager_transactions_reference_transaction_unique on wager_transactions (reference_transaction_id)',
    );
  }

  override async down(): Promise<void> {
    this.addSql('drop index if exists wager_transactions_reference_transaction_unique');
    this.addSql('drop index if exists wager_transactions_provider_external_unique');
  }
}