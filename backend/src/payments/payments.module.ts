import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RECEIPT_QUEUE } from '../common/constants/queues';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentTransaction } from './payment-transaction.entity';
import { PaymentTransactionsService } from './payment-transactions.service';
import { PaymentStrategyFactory } from './payment-strategy.factory';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { NotchPayService } from './providers/notchpay.service';
import { ZikoPayService } from './providers/zikopay.service';

function resolveRedisEnabled(): boolean {
  if (process.env.REDIS_ENABLED === undefined) {
    return process.env.NODE_ENV === 'production';
  }

  return process.env.REDIS_ENABLED.toLowerCase() === 'true';
}

const redisEnabled = resolveRedisEnabled();

@Module({
  imports: [
    InvoicesModule,
    TypeOrmModule.forFeature([PaymentTransaction]),
    ...(redisEnabled
      ? [
          BullModule.registerQueue({
            name: RECEIPT_QUEUE,
          }),
        ]
      : []),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentTransactionsService,
    PaymentStrategyFactory,
    NotchPayService,
    ZikoPayService,
  ],
  exports: [PaymentStrategyFactory, PaymentTransactionsService],
})
export class PaymentsModule {}
