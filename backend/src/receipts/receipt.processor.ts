import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { RECEIPT_QUEUE } from '../common/constants/queues';
import { InvoiceStatus } from '../common/enums/invoice-status.enum';
import { InvoicesService } from '../invoices/invoices.service';
import { ReceiptMailerService } from './receipt-mailer.service';
import { ReceiptPdfService } from './receipt-pdf.service';

type ReceiptJobData = {
  invoiceId: string;
};

@Processor(RECEIPT_QUEUE)
export class ReceiptProcessor extends WorkerHost {
  private readonly logger = new Logger(ReceiptProcessor.name);

  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly receiptPdfService: ReceiptPdfService,
    private readonly receiptMailerService: ReceiptMailerService,
  ) {
    super();
  }

  async process(job: Job<ReceiptJobData>): Promise<void> {
    if (job.name !== 'send-receipt') {
      this.logger.warn(`Unsupported receipt job: ${job.name}`);
      return;
    }

    const invoice = await this.invoicesService.findOneById(job.data.invoiceId);

    if (invoice.status !== InvoiceStatus.PAID) {
      this.logger.warn(`Skipping receipt for invoice ${invoice.id} because status=${invoice.status}`);
      return;
    }

    const pdf = await this.receiptPdfService.generatePdf(invoice);
    await this.receiptMailerService.sendInvoiceReceipt(invoice, pdf);

    this.logger.log(`Receipt sent for invoice ${invoice.reference}`);
  }
}
