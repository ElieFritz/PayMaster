import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  getCemacCountryConfig,
  normalizeCountryCode,
  SUPPORTED_CEMAC_COUNTRIES_LABEL,
} from '../common/constants/countries';
import { Currency } from '../common/enums/currency.enum';
import { InvoiceStatus } from '../common/enums/invoice-status.enum';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicePdfService } from './invoice-pdf.service';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { Invoice } from './invoice.entity';

type PaginatedInvoices = {
  items: Invoice[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type InvoiceStats = {
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  failedInvoices: number;
  refundedInvoices: number;
  paidAmount: number;
  pendingAmount: number;
  totalAmountXAF: number;
  totalAmountXOF: number;
};

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoicesRepository: Repository<Invoice>,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  async create(createInvoiceDto: CreateInvoiceDto): Promise<Invoice> {
    const country = normalizeCountryCode(createInvoiceDto.country);
    if (!getCemacCountryConfig(country)) {
      throw new BadRequestException(
        `Country ${country} is not supported. Supported countries: ${SUPPORTED_CEMAC_COUNTRIES_LABEL}.`,
      );
    }

    const currency = this.resolveCurrency(country);

    if (createInvoiceDto.currency && createInvoiceDto.currency !== currency) {
      throw new BadRequestException('Currency does not match the selected country.');
    }

    const amount = createInvoiceDto.lines.reduce(
      (total, line) => total + Number(line.quantity) * Number(line.unitPrice),
      0,
    );

    const reference = createInvoiceDto.reference || this.generateReference(country);

    const invoice = this.invoicesRepository.create({
      reference,
      amount,
      currency,
      country,
      status: InvoiceStatus.PENDING,
      customerName: createInvoiceDto.customerName,
      customerEmail: createInvoiceDto.customerEmail,
      metadata: {
        services: createInvoiceDto.lines,
        ...(createInvoiceDto.metadata || {}),
      },
    });

    return this.invoicesRepository.save(invoice);
  }

  async findOneById(id: string): Promise<Invoice> {
    const invoice = await this.invoicesRepository.findOne({ where: { id } });

    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }

    return invoice;
  }

  async findOneByReference(reference: string): Promise<Invoice> {
    const invoice = await this.invoicesRepository.findOne({ where: { reference } });

    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }

    return invoice;
  }

  async findOneByTransactionId(transactionId: string): Promise<Invoice> {
    const invoice = await this.invoicesRepository.findOne({ where: { transactionId } });

    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }

    return invoice;
  }

  async list(query: ListInvoicesQueryDto): Promise<PaginatedInvoices> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const queryBuilder = this.invoicesRepository
      .createQueryBuilder('invoice')
      .orderBy('invoice.createdAt', 'DESC');

    if (query.status) {
      queryBuilder.andWhere('invoice.status = :status', { status: query.status });
    }

    if (query.country) {
      queryBuilder.andWhere('invoice.country = :country', {
        country: query.country.toUpperCase(),
      });
    }

    if (query.search) {
      queryBuilder.andWhere(
        `(invoice.reference ILIKE :search OR invoice.customerName ILIKE :search OR invoice.customerEmail ILIKE :search)`,
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

  async getStats(): Promise<InvoiceStats> {
    const statusRows = await this.invoicesRepository
      .createQueryBuilder('invoice')
      .select('invoice.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect('COALESCE(SUM(invoice.amount), 0)::float', 'amount')
      .groupBy('invoice.status')
      .getRawMany<{
        status: InvoiceStatus;
        count: number;
        amount: number;
      }>();

    const currencyRows = await this.invoicesRepository
      .createQueryBuilder('invoice')
      .select('invoice.currency', 'currency')
      .addSelect('COALESCE(SUM(invoice.amount), 0)::float', 'amount')
      .groupBy('invoice.currency')
      .getRawMany<{ currency: Currency; amount: number }>();

    const statusMap = statusRows.reduce<Record<InvoiceStatus, { count: number; amount: number }>>(
      (acc, row) => {
        acc[row.status] = {
          count: Number(row.count),
          amount: Number(row.amount),
        };
        return acc;
      },
      {
        [InvoiceStatus.PENDING]: { count: 0, amount: 0 },
        [InvoiceStatus.PAID]: { count: 0, amount: 0 },
        [InvoiceStatus.FAILED]: { count: 0, amount: 0 },
        [InvoiceStatus.REFUNDED]: { count: 0, amount: 0 },
      },
    );

    const currencyMap = currencyRows.reduce<Record<Currency, number>>(
      (acc, row) => {
        acc[row.currency] = Number(row.amount);
        return acc;
      },
      {
        [Currency.XAF]: 0,
        [Currency.XOF]: 0,
      },
    );

    return {
      totalInvoices:
        statusMap.PENDING.count +
        statusMap.PAID.count +
        statusMap.FAILED.count +
        statusMap.REFUNDED.count,
      paidInvoices: statusMap.PAID.count,
      pendingInvoices: statusMap.PENDING.count,
      failedInvoices: statusMap.FAILED.count,
      refundedInvoices: statusMap.REFUNDED.count,
      paidAmount: statusMap.PAID.amount,
      pendingAmount: statusMap.PENDING.amount,
      totalAmountXAF: currencyMap.XAF,
      totalAmountXOF: currencyMap.XOF,
    };
  }

  async setPaymentContext(
    invoiceId: string,
    provider: PaymentProvider,
    paymentUrl?: string | null,
    transactionId?: string,
    currency?: Currency,
    providerReference?: string,
  ): Promise<Invoice> {
    const invoice = await this.findOneById(invoiceId);
    const metadata = (invoice.metadata || {}) as Record<string, unknown>;
    const paymentMetadataRaw = (metadata.payment as Record<string, unknown>) || {};

    invoice.paymentProvider = provider;
    invoice.paymentUrl = paymentUrl || null;
    invoice.transactionId = transactionId || null;
    invoice.currency = currency || invoice.currency;
    invoice.metadata = {
      ...metadata,
      payment: {
        ...paymentMetadataRaw,
        providerReference: providerReference || paymentMetadataRaw.providerReference || null,
      },
    };

    return this.invoicesRepository.save(invoice);
  }

  async updateStatus(
    invoice: Invoice,
    status: InvoiceStatus,
    metadata: Record<string, unknown> = {},
  ): Promise<Invoice> {
    invoice.status = status;
    invoice.metadata = {
      ...invoice.metadata,
      ...metadata,
    };

    return this.invoicesRepository.save(invoice);
  }

  async generatePdf(invoiceId: string): Promise<Buffer> {
    const invoice = await this.findOneById(invoiceId);
    return this.invoicePdfService.generateInvoicePdf(invoice);
  }

  private resolveCurrency(country: string): Currency {
    const countryConfig = getCemacCountryConfig(country);

    if (!countryConfig) {
      throw new BadRequestException(
        `Country ${country} is not supported. Supported countries: ${SUPPORTED_CEMAC_COUNTRIES_LABEL}.`,
      );
    }

    return countryConfig.currency;
  }

  private generateReference(country: string): string {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `TP-${country}-${Date.now()}-${suffix}`;
  }
}
