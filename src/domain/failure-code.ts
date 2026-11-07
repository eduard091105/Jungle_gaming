export enum FailureCode {
  InsufficientFunds = 'INSUFFICIENT_FUNDS',
  ReversalInsufficientFunds = 'REVERSAL_INSUFFICIENT_FUNDS',
  ReferenceNotFound = 'REFERENCE_NOT_FOUND',
  ReferenceNotProcessed = 'REFERENCE_NOT_PROCESSED',
  InvalidReferenceKind = 'INVALID_REFERENCE_KIND',
  ReferenceAlreadyReversed = 'REFERENCE_ALREADY_REVERSED',
  ReferenceAmountMismatch = 'REFERENCE_AMOUNT_MISMATCH',
  WalletNotFound = 'WALLET_NOT_FOUND',
  PlayerMismatch = 'PLAYER_MISMATCH',
  CurrencyMismatch = 'CURRENCY_MISMATCH',
}

export class DomainError extends Error {
  constructor(
    public readonly code: FailureCode | 'INVALID_TRANSACTION_STATE' | 'INVALID_MONEY_AMOUNT',
  ) {
    super(code);
    this.name = 'DomainError';
  }
}