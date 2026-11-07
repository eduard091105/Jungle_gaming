import { Body, Controller, Post, Req } from '@nestjs/common';
import type { SubmitTransactionRequest } from './transaction.dto';
import { TransactionProcessorService } from './transaction-processor.service';

@Controller('wagering')
export class TransactionController {
  constructor(private readonly transactionProcessorService: TransactionProcessorService) {}

  @Post('transactions')
  submit(
    @Body() request: SubmitTransactionRequest,
    @Req() req: { headers: Record<string, string | string[] | undefined> },
  ) {
    const header = req.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(header)
      ? header[0]
      : header ?? `${request.providerId}:${request.externalTransactionId}`;

    if (!idempotencyKey) {
      throw new Error('idempotency key is required');
    }

    const messageId = `${request.providerId}:${request.externalTransactionId}`;
    return this.transactionProcessorService.processMessage(messageId, request, idempotencyKey);
  }
}
