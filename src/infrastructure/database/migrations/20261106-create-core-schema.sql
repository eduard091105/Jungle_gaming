CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY,
  player_id VARCHAR(255) NOT NULL,
  currency CHAR(3) NOT NULL,
  balance NUMERIC(19,2) NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  player_currency_key VARCHAR(255) NOT NULL,
  CONSTRAINT wallets_player_currency_unique UNIQUE (player_id, currency),
  CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS wallets_player_currency_key_idx
  ON wallets (player_currency_key);

CREATE TABLE IF NOT EXISTS wager_transactions (
  id UUID PRIMARY KEY,
  provider_id VARCHAR(255) NOT NULL,
  external_transaction_id VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  payload_hash VARCHAR(255) NOT NULL,
  wallet_id UUID NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  round_id VARCHAR(255) NOT NULL,
  game_id VARCHAR(255) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  amount NUMERIC(19,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  reference_external_transaction_id VARCHAR(255),
  reference_transaction_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(24) NOT NULL,
  failure_code VARCHAR(255),
  processed_at TIMESTAMPTZ,
  CONSTRAINT wager_transactions_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT wager_transactions_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS wager_transactions_provider_external_idx
  ON wager_transactions (provider_id, external_transaction_id);

CREATE UNIQUE INDEX IF NOT EXISTS wager_transactions_provider_external_unique
  ON wager_transactions (provider_id, external_transaction_id);

CREATE UNIQUE INDEX IF NOT EXISTS wager_transactions_reference_transaction_unique
  ON wager_transactions (reference_transaction_id);

CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
  id UUID PRIMARY KEY,
  wallet_id UUID NOT NULL,
  transaction_id UUID NOT NULL,
  direction VARCHAR(10) NOT NULL,
  amount NUMERIC(19,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  balance_before NUMERIC(19,2) NOT NULL,
  balance_after NUMERIC(19,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_ledger_amount_positive CHECK (amount > 0),
  CONSTRAINT wallet_ledger_balance_non_negative CHECK (balance_after >= 0)
);

CREATE INDEX IF NOT EXISTS wallet_ledger_entries_wallet_idx
  ON wallet_ledger_entries (wallet_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_transaction_unique
  ON wallet_ledger_entries (transaction_id);

CREATE TABLE IF NOT EXISTS inbox_messages (
  id UUID PRIMARY KEY,
  consumer_name VARCHAR(255) NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  is_processed BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT inbox_messages_consumer_message_unique UNIQUE (consumer_name, message_id)
);

CREATE TABLE IF NOT EXISTS outbox_messages (
  id UUID PRIMARY KEY,
  event_type VARCHAR(255) NOT NULL,
  aggregate_type VARCHAR(255) NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS outbox_messages_event_type_idx
  ON outbox_messages (event_type, is_published, created_at);
