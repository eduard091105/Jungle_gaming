import { describe, expect, test } from 'bun:test';
import { Money } from '../../src/domain/money';

describe('Money', () => {
  test('normalizes valid amounts to two decimal places without floating point', () => {
    expect(Money.from({ amount: '25', currency: 'BRL' }).toJSON()).toEqual({
      amount: '25.00',
      currency: 'BRL',
    });
    expect(
      Money.from({ amount: '0.10', currency: 'BRL' })
        .add(Money.from({ amount: '0.20', currency: 'BRL' }))
        .toString(),
    ).toBe('0.30');
  });

  test.each(['', '-1.00', '1.001', '1e3', 'NaN', 'Infinity', ' 1.00'])(
    'rejects invalid input %s',
    (amount) => {
      expect(() => Money.from({ amount, currency: 'BRL' })).toThrow(
        'INVALID_MONEY_AMOUNT',
      );
    },
  );

  test('supports negative intermediate values while preserving immutability', () => {
    const balance = Money.from({ amount: '1.00', currency: 'BRL' });
    const negative = balance.subtract(Money.from({ amount: '2.00', currency: 'BRL' }));

    expect(negative.isNegative()).toBe(true);
    expect(balance.toString()).toBe('1.00');
    expect(negative.negate().toString()).toBe('1.00');
  });

  test('rejects operations across currencies', () => {
    expect(() =>
      Money.from({ amount: '1.00', currency: 'BRL' }).add(
        Money.from({ amount: '1.00', currency: 'USD' }),
      ),
    ).toThrow('CURRENCY_MISMATCH');
  });

  test('rejects malformed currency codes', () => {
    expect(() => Money.from({ amount: '1.00', currency: 'brl' })).toThrow(
      'INVALID_CURRENCY',
    );
  });
});