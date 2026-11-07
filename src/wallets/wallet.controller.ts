import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import type { CreateWalletRequest, WalletResponse } from './wallet.dto';
import { WalletService } from './wallet.service';

@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  create(@Body() request: CreateWalletRequest): Promise<WalletResponse> {
    return this.walletService.create(request);
  }

  @Get(':walletId')
  async getById(@Param('walletId') walletId: string): Promise<WalletResponse> {
    const wallet = await this.walletService.getById(walletId);
    if (!wallet) {
      throw new NotFoundException('wallet not found');
    }
    return wallet;
  }
}
