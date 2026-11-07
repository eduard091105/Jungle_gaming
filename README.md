# Jungle Gaming — Wagering Processor

This workspace contains the domain-first implementation for the distributed wagering processor challenge.

## Stack

- Runtime: Bun 1.x
- Language: TypeScript strict
- Framework: NestJS
- Money handling: Decimal.js with string-based amount values
- Tests: Bun test

## Commands

```bash
bun install
bun run migration:up
bun test test/unit
bun run typecheck
bun run build
bun run dev
```

Start local dependencies before the migration or app:

```bash
docker compose up -d postgres localstack
```

The app defaults to Postgres at `localhost:5432`. Set `SQS_ENDPOINT_URL=http://localhost:4566` to use LocalStack. The default queues are `wager-transactions` for incoming commands and `wager-events` for published outbox events. Set `SQS_CONSUMER_ENABLED=false` to disable the background transaction consumer.

To run database and queue integration tests in PowerShell:

```powershell
$env:RUN_INTEGRATION_TESTS='true'
$env:SQS_ENDPOINT_URL='http://localhost:4566'
bun test test/integration
```

## Implemented flow

- money validation and immutability
- wallet balance invariants
- ledger balancing
- transaction lifecycle and reference requirements
- database-backed wallet, transaction, ledger, inbox, and outbox persistence
- row-locked wallet mutation and database idempotency constraints
- SQS transaction consumption with acknowledgement after successful processing
- outbox publication to SQS with retry tracking
- HTTP API for wallet creation and wagering submission

The integration suite verifies persistence, redelivery idempotency, concurrent duplicate submissions, and outbox publication against the local containers. Core transaction writes and outbox creation share one PostgreSQL transaction; inbox receipt is recorded before processing and marked complete after the transaction commits.

Validated commands:

```bash
bun run migration:up
bun run typecheck
bun test test/unit
bun test test/integration
bun run build
```
