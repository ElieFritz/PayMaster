import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Currency } from '../common/enums/currency.enum';
import { InvoiceStatus } from '../common/enums/invoice-status.enum';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { Invoice } from '../invoices/invoice.entity';
import { ListPaymentTransactionsQueryDto } from './dto/list-payment-transactions-query.dto';
import {
  PaymentInitializationResult,
  PaymentWebhookEvent,
} from './interfaces/payment-strategy.interface';
import { PaymentTransaction } from './payment-transaction.entity';

type PaginatedPaymentTransactions = {
  items: PaymentTransaction[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

@Injectable()
export class PaymentTransactionsService {
  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly paymentTransactionsRepository: Repository<PaymentTransaction>,
  ) {}

  async upsertFromInitialization(
    invoice: Invoice,
    initialization: PaymentInitializationResult,
  ): Promise<PaymentTransaction> {
    let transaction = await this.paymentTransactionsRepository.findOne({
      where: {
        invoiceId: invoice.id,
        provider: initialization.provider,
        reference: invoice.reference,
      },
    });

    if (!transaction) {
      transaction = this.paymentTransactionsRepository.create({
        invoiceId: invoice.id,
        provider: initialization.provider,
        reference: invoice.reference,
      });
    }

    transaction.status = InvoiceStatus.PENDING;
    transaction.amount = invoice.amount;
    transaction.currency = initialization.currency || invoice.currency;
    transaction.country = invoice.country;
    transaction.checkoutUrl = initialization.checkoutUrl;
    transaction.providerTransactionId =
      initialization.transactionId ||
      initialization.providerReference ||
      transaction.providerTransactionId;
    transaction.payerName = invoice.customerName;
    transaction.payerEmail = invoice.customerEmail;
    transaction.payerPhone = this.resolveInvoiceCustomerPhone(invoice);
    transaction.rawInitiation = initialization.raw;
    const initiatedAt = new Date().toISOString();
    const transactionMetadata = (transaction.metadata || {}) as Record<string, unknown>;

    transaction.metadata = {
      ...transactionMetadata,
      lastInitiatedAt: initiatedAt,
      initiationCount: this.toPositiveInt(transactionMetadata.initiationCount) + 1,
      providerReference: initialization.providerReference || transactionMetadata.providerReference || null,
      customerSnapshot: this.resolveCustomerSnapshot(invoice, transaction),
      invoiceSnapshot: this.resolveInvoiceSnapshot(invoice),
    };

    return this.paymentTransactionsRepository.save(transaction);
  }

  async upsertFromWebhook(
    invoice: Invoice,
    provider: PaymentProvider,
    event: PaymentWebhookEvent,
  ): Promise<PaymentTransaction> {
    let transaction = await this.findTransactionForWebhook(invoice.id, provider, event);

    if (!transaction) {
      transaction = this.paymentTransactionsRepository.create({
        invoiceId: invoice.id,
        provider,
        reference: event.reference || invoice.reference,
      });
    }

    transaction.status = event.status;
    transaction.amount = event.amount || invoice.amount;
    transaction.currency = this.resolveCurrency(event.currency, invoice.currency);
    transaction.country = invoice.country;
    transaction.reference = event.reference || transaction.reference || invoice.reference;
    transaction.providerTransactionId = event.transactionId || transaction.providerTransactionId;
    transaction.payerName = event.payer?.name || transaction.payerName || invoice.customerName;
    transaction.payerEmail = event.payer?.email || transaction.payerEmail || invoice.customerEmail;
    transaction.payerPhone =
      event.payer?.phone || transaction.payerPhone || this.resolveInvoiceCustomerPhone(invoice);
    transaction.rawWebhook = event.raw;

    if (event.status === InvoiceStatus.PAID && !transaction.paidAt) {
      transaction.paidAt = new Date();
    }

    const transactionMetadata = (transaction.metadata || {}) as Record<string, unknown>;
    const previousEvents = Array.isArray((transactionMetadata as { events?: unknown }).events)
      ? ((transactionMetadata as { events: unknown[] }).events as unknown[])
      : [];
    const webhookReceivedAt = new Date().toISOString();
    const webhookCount = this.toPositiveInt(transactionMetadata.webhookCount) + 1;

    transaction.metadata = {
      ...transactionMetadata,
      lastWebhookAt: webhookReceivedAt,
      webhookCount,
      customerSnapshot: this.resolveCustomerSnapshot(invoice, transaction),
      invoiceSnapshot: this.resolveInvoiceSnapshot(invoice),
      lastProviderStatus: event.status,
      events: [
        ...previousEvents,
        {
          provider,
          status: event.status,
          reference: event.reference,
          transactionId: event.transactionId,
          amount: event.amount ?? null,
          currency: event.currency ?? null,
          payer: event.payer || null,
          at: webhookReceivedAt,
        },
      ],
    };

    return this.paymentTransactionsRepository.save(transaction);
  }

  async list(query: ListPaymentTransactionsQueryDto): Promise<PaginatedPaymentTransactions> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const queryBuilder = this.paymentTransactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.invoice', 'invoice')
      .orderBy('transaction.createdAt', 'DESC');

    if (query.status) {
      queryBuilder.andWhere('transaction.status = :status', { status: query.status });
    }

    if (query.provider) {
      queryBuilder.andWhere('transaction.provider = :provider', { provider: query.provider });
    }

    if (query.country) {
      queryBuilder.andWhere('transaction.country = :country', {
        country: query.country.toUpperCase(),
      });
    }

    if (query.invoiceId) {
      queryBuilder.andWhere('transaction.invoiceId = :invoiceId', {
        invoiceId: query.invoiceId,
      });
    }

    if (query.fromDate) {
      queryBuilder.andWhere('transaction.createdAt >= :fromDate', {
        fromDate: new Date(query.fromDate).toISOString(),
      });
    }

    if (query.toDate) {
      queryBuilder.andWhere('transaction.createdAt <= :toDate', {
        toDate: new Date(query.toDate).toISOString(),
      });
    }

    if (query.search) {
      queryBuilder.andWhere(
        `(transaction.reference ILIKE :search OR transaction.providerTransactionId ILIKE :search OR transaction.payerName ILIKE :search OR transaction.payerEmail ILIKE :search OR invoice.customerName ILIKE :search OR invoice.customerEmail ILIKE :search)`,
        { search: `%${query.search}%` },
      );
    }

    queryBuilder.skip((page - 1) * limit).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async listByInvoice(invoiceId: string): Promise<PaymentTransaction[]> {
    return this.paymentTransactionsRepository.find({
      where: { invoiceId },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  private async findTransactionForWebhook(
    invoiceId: string,
    provider: PaymentProvider,
    event: PaymentWebhookEvent,
  ): Promise<PaymentTransaction | null> {
    if (event.transactionId) {
      const byTransactionId = await this.paymentTransactionsRepository.findOne({
        where: {
          provider,
          providerTransactionId: event.transactionId,
        },
      });

      if (byTransactionId) {
        return byTransactionId;
      }
    }

    if (event.reference) {
      const byReference = await this.paymentTransactionsRepository.findOne({
        where: {
          provider,
          reference: event.reference,
        },
      });

      if (byReference) {
        return byReference;
      }
    }

    return this.paymentTransactionsRepository.findOne({
      where: {
        invoiceId,
        provider,
      },
    });
  }

  private resolveInvoiceCustomerPhone(invoice: Invoice): string | null {
    const metadata = (invoice.metadata || {}) as Record<string, unknown>;
    const customerPhone = metadata.customerPhone;

    if (typeof customerPhone === 'string' && customerPhone.trim().length > 0) {
      return customerPhone.trim();
    }

    return null;
  }

  private resolveCustomerSnapshot(
    invoice: Invoice,
    transaction: PaymentTransaction,
  ): Record<string, string | null> {
    return {
      name: transaction.payerName || invoice.customerName || null,
      email: transaction.payerEmail || invoice.customerEmail || null,
      phone: transaction.payerPhone || this.resolveInvoiceCustomerPhone(invoice),
    };
  }

  private resolveInvoiceSnapshot(invoice: Invoice): Record<string, unknown> {
    const metadata = (invoice.metadata || {}) as Record<string, unknown>;
    const services = Array.isArray(metadata.services) ? metadata.services : [];

    return {
      invoiceId: invoice.id,
      reference: invoice.reference,
      amount: invoice.amount,
      currency: invoice.currency,
      country: invoice.country,
      services,
    };
  }

  private toPositiveInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }

    return Math.floor(parsed);
  }

  private resolveCurrency(currency: string | undefined, fallback: Currency): Currency {
    if (currency === Currency.XAF || currency === Currency.XOF) {
      return currency;
    }

    return fallback;
  }
}
