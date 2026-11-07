import { describe, expect, test } from 'bun:test';
import { DomainError, FailureCode } from '../../src/domain/failure-code';
import { Money } from '../../src/domain/money';
import { Wallet } from '../../src/domain/wallet';

const money = (amount: string, currency = 'BRL') => Money.from({ amount, currency });

describe('Wallet', () => {
  test('changes balance and version only when a valid movement succeeds', () => {
    const wallet = Wallet.open({ id: 'w1', playerId: 'p1', initialBalance: money('100.00') });
    const change = wallet.debit(money('80.00'), new Date('2026-01-01T00:00:00Z'));

    expect(change.before.toString()).toBe('100.00');
    expect(change.after.toString()).toBe('20.00');
    expect(wallet.version).toBe(2);
    expect(() => wallet.debit(money('80.00'))).toThrow(
      new DomainError(FailureCode.InsufficientFunds),
    );
    expect(wallet.balance.toString()).toBe('20.00');
    expect(wallet.version).toBe(2);
  });

  test('rejects currency mismatch and non-positive movements', () => {
    const wallet = Wallet.open({ id: 'w1', playerId: 'p1', initialBalance: money('10.00') });
    expect(() => wallet.credit(money('1.00', 'USD'))).toThrow(
      new DomainError(FailureCode.CurrencyMismatch),
    );
    expect(() => wallet.credit(money('0.00'))).toThrow('INVALID_MONEY_AMOUNT');
  });
});