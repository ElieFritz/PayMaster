import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';

import { RECEIPT_QUEUE } from '../common/constants/queues';
import { Currency } from '../common/enums/currency.enum';
import { InvoiceStatus } from '../common/enums/invoice-status.enum';
import { InvoicesService } from '../invoices/invoices.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { SyncPaymentStatusDto } from './dto/sync-payment-status.dto';
import { PaymentStrategyFactory } from './payment-strategy.factory';
import { PaymentTransactionsService } from './payment-transactions.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly paymentStrategyFactory: PaymentStrategyFactory,
    private readonly paymentTransactionsService: PaymentTransactionsService,
    @Optional()
    @InjectQueue(RECEIPT_QUEUE)
    private readonly receiptQueue?: Queue,
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

    if (
      previousStatus !== InvoiceStatus.PAID &&
      updatedInvoice.status === InvoiceStatus.PAID &&
      this.receiptQueue
    ) {
      await this.receiptQueue.add(
        'send-receipt',
        { invoiceId: updatedInvoice.id },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
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
