import type { MoneyProps } from '../domain/money';

export const WagerTransactionKinds = ['BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'] as const;

export type WagerTransactionKind = (typeof WagerTransactionKinds)[number];

export interface SubmitTransactionRequest {
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId?: string;
}

export interface SubmitTransactionResponse {
  transactionId: string;
  status: string;
  balance: MoneyProps;
  idempotentReplay: boolean;
  failureCode?: string;
}
