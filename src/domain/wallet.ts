import { DomainError, FailureCode } from './failure-code';
import { Money } from './money';

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BalanceChange {
  before: Money;
  after: Money;
  version: number;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: {
    id: string;
    playerId: string;
    initialBalance: Money;
    at?: Date;
  }): Wallet {
    if (props.initialBalance.isNegative()) {
      throw new DomainError(FailureCode.InsufficientFunds);
    }
    const at = props.at ?? new Date();
    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      at,
      at,
    );
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(amount: Money, at = new Date()): BalanceChange {
    this.assertSameCurrency(amount);
    if (amount.isZero() || amount.isNegative()) {
      throw new DomainError('INVALID_MONEY_AMOUNT');
    }
    if (this._balance.isLessThan(amount)) {
      throw new DomainError(FailureCode.InsufficientFunds);
    }
    return this.changeBalance(this._balance.subtract(amount), at);
  }

  credit(amount: Money, at = new Date()): BalanceChange {
    this.assertSameCurrency(amount);
    if (amount.isZero() || amount.isNegative()) {
      throw new DomainError('INVALID_MONEY_AMOUNT');
    }
    return this.changeBalance(this._balance.add(amount), at);
  }

  private changeBalance(after: Money, at: Date): BalanceChange {
    const before = this._balance;
    this._balance = after;
    this._version += 1;
    this._updatedAt = at;
    return { before, after, version: this._version };
  }

  private assertSameCurrency(money: Money): void {
    if (money.currency !== this.currency) {
      throw new DomainError(FailureCode.CurrencyMismatch);
    }
  }
}