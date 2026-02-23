import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { RECEIPT_QUEUE } from '../common/constants/queues';
import { ReceiptService } from './receipt.service';

type ReceiptJobData = {
  invoiceId: string;
};

@Processor(RECEIPT_QUEUE)
export class ReceiptProcessor extends WorkerHost {
  private readonly logger = new Logger(ReceiptProcessor.name);

  constructor(private readonly receiptService: ReceiptService) {
    super();
  }

  async process(job: Job<ReceiptJobData>): Promise<void> {
    if (job.name !== 'send-receipt') {
      this.logger.warn(`Unsupported receipt job: ${job.name}`);
      return;
    }

    await this.receiptService.sendPaidInvoiceReceipt(job.data.invoiceId);
  }
}
