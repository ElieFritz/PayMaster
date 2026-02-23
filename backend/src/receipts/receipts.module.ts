import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { RECEIPT_QUEUE } from '../common/constants/queues';
import { ReceiptCoreModule } from './receipt-core.module';
import { ReceiptProcessor } from './receipt.processor';

@Module({
  imports: [
    ReceiptCoreModule,
    BullModule.registerQueue({
      name: RECEIPT_QUEUE,
    }),
  ],
  providers: [ReceiptProcessor],
})
export class ReceiptsModule {}
