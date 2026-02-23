import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { InvoiceStatus } from '../common/enums/invoice-status.enum';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { InvoicesService } from '../invoices/invoices.service';
import { PaymentStrategy } from '../payments/interfaces/payment-strategy.interface';
import { PaymentStrategyFactory } from '../payments/payment-strategy.factory';
import { PaymentTransactionsService } from '../payments/payment-transactions.service';
import { ReceiptService } from '../receipts/receipt.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly invoicesService: InvoicesService,
    private readonly paymentStrategyFactory: PaymentStrategyFactory,
    private readonly paymentTransactionsService: PaymentTransactionsService,
    private readonly receiptService: ReceiptService,
  ) {}

  async handleWebhook(
    provider: string,
    rawBody: Buffer,
    body: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    let strategy: PaymentStrategy;
    try {
      strategy = this.paymentStrategyFactory.resolveByProvider(provider);
    } catch {
      throw new BadRequestException(`Unsupported provider: ${provider}`);
    }

    const signature = this.extractSignature(strategy.provider, headers);
    const secret = this.resolveWebhookSecret(strategy.provider);

    const isSignatureValid = strategy.validateWebhookSignature(rawBody, signature, secret);
    if (!isSignatureValid) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }

    const event = strategy.parseWebhookPayload(body);

    if (!event.reference && !event.transactionId) {
      throw new BadRequestException('Webhook payload is missing invoice identifier.');
    }

    const invoice = await this.resolveInvoiceFromWebhook(event.reference, event.transactionId);

    const wasPaid = invoice.status === InvoiceStatus.PAID;

    const updatedInvoice = await this.invoicesService.updateStatus(invoice, event.status, {
      webhook: {
        provider: strategy.provider,
        status: event.status,
        receivedAt: new Date().toISOString(),
        payload: event.raw,
      },
    });

    await this.paymentTransactionsService.upsertFromWebhook(invoice, strategy.provider, event);

    if (!wasPaid && updatedInvoice.status === InvoiceStatus.PAID) {
      try {
        await this.receiptService.sendPaidInvoiceReceipt(updatedInvoice.id);
      } catch (error) {
        this.logger.error(
          `Failed to send receipt for invoice ${updatedInvoice.reference}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private resolveWebhookSecret(provider: PaymentProvider): string {
    if (provider === PaymentProvider.NOTCHPAY) {
      return this.configService.get<string>('NOTCHPAY_WEBHOOK_SECRET', '');
    }

    if (provider === PaymentProvider.ZIKOPAY) {
      return this.configService.get<string>('ZIKOPAY_WEBHOOK_SECRET', '');
    }

    throw new BadRequestException(`Unsupported provider: ${provider}`);
  }

  private extractSignature(
    provider: PaymentProvider,
    headers: Record<string, string | string[] | undefined>,
  ): string | undefined {
    if (provider === PaymentProvider.NOTCHPAY) {
      return (
        this.getHeader(headers, 'x-notchpay-signature') ||
        this.getHeader(headers, 'x-notch-signature') ||
        this.getHeader(headers, 'x-signature')
      );
    }

    return (
      this.getHeader(headers, 'x-zikopay-signature') ||
      this.getHeader(headers, 'x-ziko-signature') ||
      this.getHeader(headers, 'x-signature')
    );
  }

  private getHeader(
    headers: Record<string, string | string[] | undefined>,
    key: string,
  ): string | undefined {
    const value = headers[key] || headers[key.toLowerCase()];

    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  }

  private async resolveInvoiceFromWebhook(
    reference?: string,
    transactionId?: string,
  ): Promise<Awaited<ReturnType<InvoicesService['findOneById']>>> {
    if (reference) {
      try {
        return await this.invoicesService.findOneByReference(reference);
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error;
        }
      }
    }

    if (transactionId) {
      return this.invoicesService.findOneByTransactionId(transactionId);
    }

    throw new BadRequestException('Webhook payload is missing invoice identifier.');
  }
}

