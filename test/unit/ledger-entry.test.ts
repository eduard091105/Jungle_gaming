import { describe, expect, test } from 'bun:test';
import { Money } from '../../src/domain/money';
import { LedgerDirection } from '../../src/domain/wager-transaction';
import { WalletLedgerEntry } from '../../src/domain/wallet-ledger-entry';

const money = (amount: string) => Money.from({ amount, currency: 'BRL' });

describe('WalletLedgerEntry', () => {
  test('accepts a balanced debit and rejects an unbalanced entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'l1',
      walletId: 'w1',
      transactionId: 't1',
      direction: LedgerDirection.Debit,
      money: money('20.00'),
      balanceBefore: money('100.00'),
      balanceAfter: money('80.00'),
    });
    expect(entry.isBalanced()).toBe(true);
    expect(() =>
      WalletLedgerEntry.create({
        id: 'l2',
        walletId: 'w1',
        transactionId: 't2',
        direction: LedgerDirection.Credit,
        money: money('20.00'),
        balanceBefore: money('100.00'),
        balanceAfter: money('119.99'),
      }),
    ).toThrow('REFERENCE_AMOUNT_MISMATCH');
  });
});