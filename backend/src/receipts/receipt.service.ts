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

    const pdf = await this.receiptPdfService.generatePdf(invoice);
    await this.receiptMailerService.sendInvoiceReceipt(invoice, pdf);

    this.logger.log(`Receipt sent for invoice ${invoice.reference}`);
  }
}
