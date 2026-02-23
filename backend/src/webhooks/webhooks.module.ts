import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { RECEIPT_QUEUE } from '../common/constants/queues';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReceiptCoreModule } from '../receipts/receipt-core.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

function resolveRedisEnabled(): boolean {
  if (process.env.REDIS_ENABLED === undefined) {
    return process.env.NODE_ENV === 'production';
  }

  return process.env.REDIS_ENABLED.toLowerCase() === 'true';
}

const redisEnabled = resolveRedisEnabled();

@Module({
  imports: [
    PaymentsModule,
    InvoicesModule,
    ReceiptCoreModule,
    ...(redisEnabled
      ? [
          BullModule.registerQueue({
            name: RECEIPT_QUEUE,
          }),
        ]
      : []),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}

