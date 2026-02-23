import { Module } from '@nestjs/common';

import { InvoicesModule } from '../invoices/invoices.module';
import { ReceiptMailerService } from './receipt-mailer.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { ReceiptService } from './receipt.service';

@Module({
  imports: [InvoicesModule],
  providers: [ReceiptPdfService, ReceiptMailerService, ReceiptService],
  exports: [ReceiptService, ReceiptPdfService, ReceiptMailerService],
})
export class ReceiptCoreModule {}
