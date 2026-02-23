import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { RECEIPT_QUEUE } from '../common/constants/queues';
import { InvoicesModule } from '../invoices/invoices.module';
import { ReceiptMailerService } from './receipt-mailer.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { ReceiptProcessor } from './receipt.processor';

@Module({
  imports: [
    InvoicesModule,
    BullModule.registerQueue({
      name: RECEIPT_QUEUE,
    }),
  ],
  providers: [ReceiptPdfService, ReceiptMailerService, ReceiptProcessor],
})
export class ReceiptsModule {}
