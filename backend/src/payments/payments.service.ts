import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

import { Currency } from '../common/enums/currency.enum';
import { InvoiceStatus } from '../common/enums/invoice-status.enum';
import { InvoicesService } from '../invoices/invoices.service';
import { ReceiptService } from '../receipts/receipt.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import {
  MANUAL_PAYMENT_METHODS,
  ManualPaymentMethod,
  ManualUpdateInvoiceStatusDto,
} from './dto/manual-update-invoice-status.dto';
import { SyncPaymentStatusDto } from './dto/sync-payment-status.dto';
import { PaymentStrategyFactory } from './payment-strategy.factory';
import { PaymentTransactionsService } from './payment-transactions.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly paymentStrategyFactory: PaymentStrategyFactory,
    private readonly paymentTransactionsService: PaymentTransactionsService,
    private readonly receiptService: ReceiptService,
  ) {}

  async initiatePayment(initiatePaymentDto: InitiatePaymentDto) {
    const invoice = await this.invoicesService.findOneById(initiatePaymentDto.invoiceId);
    const country = (initiatePaymentDto.country || invoice.country).toUpperCase();

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid.');
    }

    if (invoice.status === InvoiceStatus.REFUNDED) {
      throw new BadRequestException('Invoice is refunded and cannot be paid again.');
    }

    if (invoice.amount <= 0) {
      throw new BadRequestException('Invoice amount must be greater than 0 to initialize payment.');
    }

    if (invoice.status === InvoiceStatus.PENDING && invoice.paymentUrl) {
      const strategy = this.paymentStrategyFactory.resolveByCountry(country);
      const provider = invoice.paymentProvider || strategy.provider;
      const existingProviderReference = this.resolveInvoiceProviderReference(invoice);

      await this.paymentTransactionsService.upsertFromInitialization(invoice, {
        provider,
        checkoutUrl: invoice.paymentUrl,
        providerReference: existingProviderReference || undefined,
        transactionId: invoice.transactionId || undefined,
        raw: {
          reusedExistingPaymentUrl: true,
        },
      });

      return {
        invoiceId: invoice.id,
        reference: invoice.reference,
        amount: invoice.amount,
        currency: invoice.currency,
        provider,
        checkoutUrl: invoice.paymentUrl,
        providerReference: existingProviderReference,
        transactionId: invoice.transactionId,
        message: 'Payment already initialized for this invoice.',
      };
    }

    const strategy = this.paymentStrategyFactory.resolveByCountry(country);

    const paymentSession = await strategy.initializePayment({
      invoice,
      successUrl: initiatePaymentDto.successUrl,
      cancelUrl: initiatePaymentDto.cancelUrl,
    });
    const appliedCurrency = resolveAppliedCurrency(paymentSession.currency, invoice.currency);

    await this.invoicesService.setPaymentContext(
      invoice.id,
      paymentSession.provider,
      paymentSession.checkoutUrl || null,
      paymentSession.transactionId,
      appliedCurrency,
      paymentSession.providerReference,
    );

    await this.paymentTransactionsService.upsertFromInitialization(invoice, paymentSession);

    return {
      invoiceId: invoice.id,
      reference: invoice.reference,
      amount: invoice.amount,
      currency: appliedCurrency,
      provider: paymentSession.provider,
      checkoutUrl: paymentSession.checkoutUrl || null,
      providerReference: paymentSession.providerReference || null,
      transactionId: paymentSession.transactionId,
      message: resolveGatewayMessage(paymentSession.raw),
    };
  }

  async syncInvoiceStatus(invoiceId: string, input?: SyncPaymentStatusDto) {
    const invoice = await this.invoicesService.findOneById(invoiceId);
    const inferredStrategy = this.paymentStrategyFactory.resolveByCountry(invoice.country);
    const provider = input?.provider || invoice.paymentProvider || inferredStrategy.provider;
    const strategy = this.paymentStrategyFactory.resolveByProvider(provider);

    if (!strategy.fetchPaymentStatus) {
      throw new BadRequestException(
        `Provider ${provider} does not support status synchronization.`,
      );
    }

    const statusReference =
      input?.providerReference || (await this.resolveStatusReference(invoice.id, invoice));

    if (!statusReference) {
      throw new BadRequestException(
        'Missing provider reference. Initialize payment first to synchronize status.',
      );
    }

    let invoiceForUpdate = invoice;

    if (!invoice.paymentProvider || invoice.paymentProvider !== strategy.provider) {
      invoiceForUpdate = await this.invoicesService.setPaymentContext(
        invoice.id,
        strategy.provider,
        invoice.paymentUrl || null,
        invoice.transactionId || undefined,
        invoice.currency,
        statusReference,
      );
    }

    const previousStatus = invoiceForUpdate.status;
    const providerStatus = await strategy.fetchPaymentStatus(statusReference);

    const updatedInvoice = await this.invoicesService.updateStatus(invoiceForUpdate, providerStatus.status, {
      providerStatusSync: {
        provider: strategy.provider,
        reference: providerStatus.reference || statusReference,
        transactionId: providerStatus.transactionId || invoiceForUpdate.transactionId || null,
        at: new Date().toISOString(),
        payload: providerStatus.raw,
      },
    });

    await this.paymentTransactionsService.upsertFromWebhook(updatedInvoice, strategy.provider, {
      status: providerStatus.status,
      reference: providerStatus.reference || statusReference,
      transactionId: providerStatus.transactionId || invoiceForUpdate.transactionId || undefined,
      amount: providerStatus.amount,
      currency: providerStatus.currency,
      raw: providerStatus.raw,
    });

    if (previousStatus !== InvoiceStatus.PAID && updatedInvoice.status === InvoiceStatus.PAID) {
      try {
        await this.receiptService.sendPaidInvoiceReceipt(updatedInvoice.id);
      } catch (error) {
        this.logger.error(
          `Failed to send receipt for invoice ${updatedInvoice.reference}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return {
      invoiceId: updatedInvoice.id,
      reference: updatedInvoice.reference,
      provider: strategy.provider,
      providerReference: providerStatus.reference || statusReference,
      previousStatus,
      currentStatus: updatedInvoice.status,
      syncedAt: new Date().toISOString(),
    };
  }

  async resendReceipt(invoiceId: string) {
    const invoice = await this.invoicesService.findOneById(invoiceId);

    if (invoice.status !== InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice must be PAID before sending a receipt.');
    }

    try {
      await this.receiptService.sendPaidInvoiceReceipt(invoice.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to send receipt email at the moment.';
      throw new InternalServerErrorException(message);
    }

    return {
      invoiceId: invoice.id,
      reference: invoice.reference,
      status: invoice.status,
      recipient: invoice.customerEmail,
      sentAt: new Date().toISOString(),
    };
  }

  async manualUpdateInvoiceStatus(
    invoiceId: string,
    input: ManualUpdateInvoiceStatusDto,
    updatedByEmail?: string | null,
  ) {
    const invoice = await this.invoicesService.findOneById(invoiceId);
    const previousStatus = invoice.status;
    const updatedAt = new Date().toISOString();
    const note = normalizeOptionalString(input.note);
    const paymentMethod = normalizeManualPaymentMethod(input.paymentMethod);

    const metadata = (invoice.metadata || {}) as Record<string, unknown>;
    const history = Array.isArray(metadata.manualStatusHistory)
      ? metadata.manualStatusHistory.filter((entry) => entry && typeof entry === 'object')
      : [];

    const historyEntry = {
      at: updatedAt,
      by: updatedByEmail || null,
      from: previousStatus,
      to: input.status,
      note: note || null,
      paymentMethod: paymentMethod || null,
      source: 'DASHBOARD_MANUAL',
    };

    const updatedInvoice = await this.invoicesService.updateStatus(invoice, input.status, {
      manualStatusUpdate: historyEntry,
      manualStatusHistory: [...history.slice(-49), historyEntry],
    });

    let receiptSent = false;
    let receiptQueued = false;
    const shouldSendReceipt = input.sendReceipt !== false;

    if (
      shouldSendReceipt &&
      previousStatus !== InvoiceStatus.PAID &&
      updatedInvoice.status === InvoiceStatus.PAID
    ) {
      receiptQueued = true;
      void this.receiptService
        .sendPaidInvoiceReceipt(updatedInvoice.id)
        .then(() => {
          this.logger.log(
            `Receipt sent after manual status update for invoice ${updatedInvoice.reference}`,
          );
        })
        .catch((error) => {
          this.logger.error(
            `Failed to send receipt after manual status update for invoice ${updatedInvoice.reference}`,
            error instanceof Error ? error.stack : String(error),
          );
        });
    }

    return {
      invoiceId: updatedInvoice.id,
      reference: updatedInvoice.reference,
      previousStatus,
      currentStatus: updatedInvoice.status,
      paymentMethod: paymentMethod || null,
      note: note || null,
      updatedBy: updatedByEmail || null,
      updatedAt,
      manual: true,
      receiptSent,
      receiptQueued,
    };
  }

  private async resolveStatusReference(
    invoiceId: string,
    invoice: Awaited<ReturnType<InvoicesService['findOneById']>>,
  ): Promise<string | null> {
    const metadata = (invoice.metadata || {}) as Record<string, unknown>;
    const paymentMetadata =
      metadata.payment && typeof metadata.payment === 'object'
        ? (metadata.payment as Record<string, unknown>)
        : null;

    const transactions = await this.paymentTransactionsService.listByInvoice(invoiceId);
    const latestTransaction = transactions[0];
    const latestMetadata =
      latestTransaction?.metadata && typeof latestTransaction.metadata === 'object'
        ? (latestTransaction.metadata as Record<string, unknown>)
        : null;
    const latestRawInitiation =
      latestTransaction?.rawInitiation && typeof latestTransaction.rawInitiation === 'object'
        ? (latestTransaction.rawInitiation as Record<string, unknown>)
        : null;

    return firstNonEmptyString([
      paymentMetadata?.providerReference,
      latestMetadata?.providerReference,
      latestRawInitiation?.providerReference,
      latestRawInitiation?.reference,
      latestTransaction?.providerTransactionId,
      invoice.transactionId,
      invoice.reference,
    ]);
  }

  private resolveInvoiceProviderReference(
    invoice: Awaited<ReturnType<InvoicesService['findOneById']>>,
  ): string | null {
    const metadata = (invoice.metadata || {}) as Record<string, unknown>;
    const paymentMetadata =
      metadata.payment && typeof metadata.payment === 'object'
        ? (metadata.payment as Record<string, unknown>)
        : null;

    return firstNonEmptyString([
      paymentMetadata?.providerReference,
      invoice.transactionId,
      invoice.reference,
    ]);
  }
}

function resolveGatewayMessage(raw: Record<string, unknown>): string | null {
  const message = raw.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message.trim();
  }

  const data = raw.data;
  if (data && typeof data === 'object') {
    const nestedMessage = (data as Record<string, unknown>).message;
    if (typeof nestedMessage === 'string' && nestedMessage.trim().length > 0) {
      return nestedMessage.trim();
    }
  }

  return null;
}

function resolveAppliedCurrency(
  gatewayCurrency: Currency | undefined,
  invoiceCurrency: Currency,
): Currency {
  return gatewayCurrency || invoiceCurrency;
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeManualPaymentMethod(value: unknown): ManualPaymentMethod | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if ((MANUAL_PAYMENT_METHODS as readonly string[]).includes(normalized)) {
    return normalized as ManualPaymentMethod;
  }

  return null;
}
