import { Injectable, Logger } from '@nestjs/common';

import { InvoiceStatus } from '../common/enums/invoice-status.enum';
import { InvoicesService } from '../invoices/invoices.service';
import { ReceiptMailerService } from './receipt-mailer.service';
import { ReceiptPdfService } from './receipt-pdf.service';

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly receiptPdfService: ReceiptPdfService,
    private readonly receiptMailerService: ReceiptMailerService,
  ) {}

  async sendPaidInvoiceReceipt(invoiceId: string): Promise<void> {
    const invoice = await this.invoicesService.findOneById(invoiceId);

    if (invoice.status !== InvoiceStatus.PAID) {
      this.logger.warn(`Skipping receipt for invoice ${invoice.id} because status=${invoice.status}`);
      return;
    }

    let pdf: Buffer | undefined;

    try {
      pdf = await this.receiptPdfService.generatePdf(invoice);
    } catch (error) {
      this.logger.error(
        `Failed to generate receipt PDF for invoice ${invoice.reference}. Sending email without attachment.`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    await this.receiptMailerService.sendInvoiceReceipt(invoice, pdf);

    this.logger.log(`Receipt sent for invoice ${invoice.reference}`);
  }
}
