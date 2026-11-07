# Architecture notes

## Domain modeling

The project follows a domain-first approach where money, wallet movement, ledger entries, and transaction states are modelled as immutable value objects and aggregate behaviors. The critical rule is that the engine never stores or manipulates money using `number`, `float`, or `double`.

`Money` stores a `Decimal` instance internally and serializes amounts as fixed two-decimal strings for JSON transport. Validation rejects empty strings, scientific notation, malformed decimals, negative amounts for entry contracts, and currency mismatches.

## Wallet aggregate

The wallet aggregate keeps the balance and version together and emits a balance change only when a valid debit or credit is applied. The `version` field is incremented only on successful balance changes, which supports optimistic concurrency and clearly separates valid state transitions from business rejections.

## Ledger

Each financial transaction yields at most one ledger entry for that wallet. The `WalletLedgerEntry` factory performs arithmetic validation so that `balanceBefore ± amount == balanceAfter` is enforced in the model itself before persistence.

## Transaction status model

The transaction lifecycle follows a strict state machine. `PENDING` and `PENDING_REFERENCE` are active states; `PROCESSED`, `REJECTED`, and `FAILED` are terminal. Any attempt to transition out of a terminal state raises a domain error.

## Concurrency strategy

PostgreSQL is the source of truth. Each wager runs in a database transaction, locks its wallet row with `FOR UPDATE`, updates the balance/version, writes the wager and ledger entry, and creates the outbox event before commit. Unique constraints cover provider transaction IDs, idempotency keys, and reversal references, so concurrent duplicate submissions cannot debit twice.

The inbox uses a unique `(consumer_name, message_id)` key. SQS messages are acknowledged only after processing has committed and the inbox row is marked processed. A crash before acknowledgement causes redelivery; the persistent idempotency key returns the original result. The outbox publisher sends pending events and marks them published only after SQS accepts them, so a crash between send and marking can produce a duplicate event. Consumers should therefore deduplicate outbox event IDs.

## Why this is acceptable for the challenge

Money precision is preserved at the value-object layer, balance mutation is explicit, and database constraints protect the critical idempotency and ledger invariants across application instances. The local integration suite exercises PostgreSQL and LocalStack together, including duplicate delivery and concurrent replay.
