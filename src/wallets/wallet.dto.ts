import type { MoneyProps } from '../domain/money';

export interface CreateWalletRequest {
  playerId: string;
  initialBalance: MoneyProps;
}

export interface WalletResponse {
  id: string;
  playerId: string;
  balance: MoneyProps;
  version: number;
}
