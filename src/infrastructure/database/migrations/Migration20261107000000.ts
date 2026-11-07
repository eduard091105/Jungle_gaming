import { Migration } from '@mikro-orm/migrations';
import { readFileSync } from 'node:fs';

export class Migration20261107000000 extends Migration {
  async up(): Promise<void> {
    const schema = readFileSync(new URL('./20261106-create-core-schema.sql', import.meta.url), 'utf8');
    for (const statement of schema.split(';').map((part) => part.trim()).filter(Boolean)) {
      this.addSql(statement);
    }
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists outbox_messages');
    this.addSql('drop table if exists inbox_messages');
    this.addSql('drop table if exists wallet_ledger_entries');
    this.addSql('drop table if exists wager_transactions');
    this.addSql('drop table if exists wallets');
  }
}