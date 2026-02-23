import { createHmac, timingSafeEqual } from 'crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { Currency } from '../../common/enums/currency.enum';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { PaymentProvider } from '../../common/enums/payment-provider.enum';
import { PaymentGatewayException } from '../../common/exceptions/payment-gateway.exception';
import {
  PaymentInitializationInput,
  PaymentInitializationResult,
  PaymentStatusSyncResult,
  PaymentStrategy,
  PaymentWebhookEvent,
} from '../interfaces/payment-strategy.interface';

const SUPPORTED_OPERATORS_BY_COUNTRY: Record<string, string[]> = {
  CI: ['orange_ci', 'mtn_ci', 'moov_ci', 'wave_ci'],
  SN: ['orange_sn', 'free_money_sn', 'expresso_sn'],
  BJ: ['mtn_bj', 'moov_bj'],
  TG: ['t_money_tg'],
};

@Injectable()
export class ZikoPayService implements PaymentStrategy {
  readonly provider = PaymentProvider.ZIKOPAY;
  private walletCache: { currencies: Currency[]; expiresAt: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  supportsCountry(country: string): boolean {
    return country.toUpperCase() !== 'CM';
  }

  async initializePayment(
    input: PaymentInitializationInput,
  ): Promise<PaymentInitializationResult> {
    const mockMode = this.configService.get<string>('PAYMENT_PROVIDER_MOCK', 'false') === 'true';
    const baseUrl = this.configService.get<string>(
      'ZIKOPAY_BASE_URL',
      'https://api.payment.zikopay.com/v1',
    );
    const apiKey = this.configService.get<string>('ZIKOPAY_API_KEY', '');
    const apiSecret = this.configService.get<string>('ZIKOPAY_API_SECRET', '');
    const country = input.invoice.country.toUpperCase();

    if (mockMode) {
      return {
        provider: this.provider,
        currency: input.invoice.currency,
        providerReference: input.invoice.reference,
        checkoutUrl: `${baseUrl}/checkout/mock/${input.invoice.reference}`,
        transactionId: `mock-ziko-${input.invoice.id}`,
        raw: { mockMode: true },
      };
    }

    if (!apiKey || !apiSecret) {
      throw new PaymentGatewayException(
        this.provider,
        'ZIKOPAY_API_KEY or ZIKOPAY_API_SECRET is missing. Set both or enable PAYMENT_PROVIDER_MOCK=true.',
      );
    }

    const amount = Math.round(Number(input.invoice.amount));
    const requestedCurrency = input.invoice.currency;
    const walletCurrencies = await this.fetchWalletCurrencies(baseUrl, apiKey, apiSecret);
    const currency = this.resolvePaymentCurrency(requestedCurrency, walletCurrencies, country);
    const customerPhone = this.normalizePhoneNumber(this.resolveCustomerPhone(input));
    const operator = this.resolveAndValidateOperator(
      (input.invoice.metadata || {}) as Record<string, unknown>,
      country,
    );
    const providerReference = this.buildProviderReference(input.invoice.reference);
    const transactionId = this.buildTransactionId(input.invoice.reference);

    try {
      const response = await axios.post(
        `${baseUrl}/payments/payin/mobile-money`,
        {
          transaction_id: transactionId,
          reference: providerReference,
          amount,
          phoneNumber: customerPhone,
          currency,
          operator,
          return_url: input.successUrl,
          cancel_url: input.cancelUrl,
          callback_url: input.successUrl,
          description: `Invoice ${input.invoice.reference}`,
          payment_details: {
            order_id: input.invoice.id,
            transaction_id: transactionId,
            invoice_reference: input.invoice.reference,
            items: `Invoice ${input.invoice.reference}`,
          },
          customer: {
            name: input.invoice.customerName,
            email: input.invoice.customerEmail,
            phone: customerPhone,
          },
        },
        {
          headers: {
            'X-API-Key': apiKey,
            'X-API-Secret': apiSecret,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 12_000,
        },
      );

      const data = response.data as Record<string, any>;
      const transaction = (data.transaction as Record<string, any>) || data.data || {};
      const apiStatus = String(data.status || '').toLowerCase();
      const apiMessage = extractApiMessage(data);
      const responseReference = firstNonEmptyString([
        data.reference,
        transaction.reference,
        data.data?.reference,
        providerReference,
      ]);
      const responseTransactionId = firstNonEmptyString([
        data.transaction_id,
        transaction.transaction_id,
        data.id,
        data.data?.id,
        transactionId,
      ]);

      if (apiStatus === 'failed' || apiStatus === 'error') {
        throw new PaymentGatewayException(
          this.provider,
          apiMessage || 'ZikoPay rejected the mobile money initiation request.',
          data,
        );
      }

      const checkoutUrl =
        data.paymentUrl ||
        data.checkout_url ||
        data.payment_url ||
        data.authorization_url ||
        data.payment_link ||
        transaction.paymentUrl ||
        data.data?.checkout_url ||
        data.data?.payment_url ||
        data.data?.authorization_url ||
        null;

      return {
        provider: this.provider,
        currency,
        providerReference: responseReference || providerReference,
        checkoutUrl: checkoutUrl || undefined,
        transactionId: responseTransactionId || responseReference || transactionId,
        raw: {
          ...data,
          requestedCurrency,
          appliedCurrency: currency,
          providerReference: responseReference || providerReference,
          providerTransactionId: responseTransactionId || null,
          walletCurrencies,
        },
      };
    } catch (error) {
      const providerError = extractProviderError(error);
      const providerMessage = extractProviderMessage(providerError);

      if (providerMessage && providerMessage.toLowerCase().includes('currency not supported')) {
        const walletHint =
          walletCurrencies.length > 0 ? walletCurrencies.join(', ') : 'no wallet detected';
        throw new PaymentGatewayException(
          this.provider,
          `ZikoPay rejected currency ${currency} for country ${country}. Wallet currencies: ${walletHint}.`,
          providerError,
        );
      }

      throw new PaymentGatewayException(
        this.provider,
        'Unable to initialize ZikoPay transaction.',
        providerError,
      );
    }
  }

  async fetchPaymentStatus(reference: string): Promise<PaymentStatusSyncResult> {
    const baseUrl = this.configService.get<string>(
      'ZIKOPAY_BASE_URL',
      'https://api.payment.zikopay.com/v1',
    );
    const apiKey = this.configService.get<string>('ZIKOPAY_API_KEY', '');
    const apiSecret = this.configService.get<string>('ZIKOPAY_API_SECRET', '');

    if (!apiKey || !apiSecret) {
      throw new PaymentGatewayException(
        this.provider,
        'ZIKOPAY_API_KEY or ZIKOPAY_API_SECRET is missing.',
      );
    }

    try {
      const response = await axios.get(
        `${baseUrl}/payment/status/${encodeURIComponent(reference)}`,
        {
          headers: {
            'X-API-Key': apiKey,
            'X-API-Secret': apiSecret,
            Accept: 'application/json',
          },
          timeout: 10_000,
        },
      );

      const payload = response.data as Record<string, any>;
      const topStatus = String(payload.status || '').toLowerCase();
      const data = (payload.data as Record<string, unknown>) || {};

      if (topStatus !== 'success') {
        throw new PaymentGatewayException(
          this.provider,
          extractApiMessage(payload) || 'Unable to fetch transaction status from ZikoPay.',
          payload,
        );
      }

      const providerStatusRaw = String(data.status || payload.transaction_status || '');

      return {
        status: normalizePaymentStatus(providerStatusRaw),
        reference:
          firstNonEmptyString([
            data.reference,
            payload.reference,
            reference,
          ]) || undefined,
        transactionId:
          firstNonEmptyString([
            data.transaction_id,
            payload.transaction_id,
            payload.id,
          ]) || undefined,
        amount: toOptionalNumber(data.amount),
        currency:
          firstNonEmptyString([
            data.currency,
            payload.currency,
          ]) || undefined,
        raw: payload,
      };
    } catch (error) {
      throw new PaymentGatewayException(
        this.provider,
        'Unable to fetch ZikoPay transaction status.',
        extractProviderError(error),
      );
    }
  }

  validateWebhookSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
    if (!signature || !secret) {
      return false;
    }

    const normalizedSignature = signature.replace(/^sha256=/i, '').trim();
    const computed = createHmac('sha256', secret).update(rawBody).digest('hex');

    return compareSignatures(normalizedSignature, computed);
  }

  parseWebhookPayload(payload: Record<string, unknown>): PaymentWebhookEvent {
    const data = (payload.data as Record<string, unknown>) || {};
    const payloadPaymentDetails = (payload.payment_details as Record<string, unknown>) || {};
    const dataPaymentDetails = (data.payment_details as Record<string, unknown>) || {};
    const customer =
      (payload.customer as Record<string, unknown>) ||
      (data.customer as Record<string, unknown>) ||
      {};

    const statusRaw =
      (payload.status as string) ||
      (data.status as string) ||
      ((payload.event as string) ?? '');

    return {
      status: normalizePaymentStatus(statusRaw),
      reference:
        (payload.invoice_reference as string) ||
        (payloadPaymentDetails.invoice_reference as string) ||
        (payload.reference as string) ||
        (data.invoice_reference as string) ||
        (dataPaymentDetails.invoice_reference as string) ||
        (data.reference as string),
      transactionId:
        (payload.transaction_id as string) ||
        (payloadPaymentDetails.transaction_id as string) ||
        (data.transaction_id as string) ||
        (dataPaymentDetails.transaction_id as string) ||
        (payload.reference as string) ||
        (data.reference as string) ||
        (data.id as string),
      payer: {
        name: (customer.name as string),
        email: (customer.email as string),
        phone: (customer.phone as string),
      },
      amount: Number((payload.amount as number) || (data.amount as number) || 0) || undefined,
      currency: (payload.currency as string) || (data.currency as string),
      raw: payload,
    };
  }

  private resolveCustomerPhone(input: PaymentInitializationInput): string {
    const metadata = (input.invoice.metadata || {}) as Record<string, unknown>;
    const metadataPhone = metadata.customerPhone;
    const defaultPhone = this.configService.get<string>('ZIKOPAY_DEFAULT_PHONE', '');

    if (typeof metadataPhone === 'string' && metadataPhone.trim().length > 0) {
      return metadataPhone.trim();
    }

    if (defaultPhone.trim().length > 0) {
      return defaultPhone.trim();
    }

    throw new PaymentGatewayException(
      this.provider,
      'Customer phone is required for ZikoPay. Add metadata.customerPhone or set ZIKOPAY_DEFAULT_PHONE.',
    );
  }

  private normalizePhoneNumber(raw: string): string {
    const normalized = raw.replace(/[^\d]/g, '');

    if (normalized.length < 6) {
      throw new PaymentGatewayException(
        this.provider,
        'Invalid customer phone format for ZikoPay mobile money.',
      );
    }

    return normalized;
  }

  private buildTransactionId(reference: string): string {
    const normalized = reference.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 36);
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();

    if (normalized.length > 0) {
      return `${normalized}-${suffix}`;
    }

    return `TP-${Date.now()}-${suffix}`;
  }

  private buildProviderReference(reference: string): string {
    const normalized = reference.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();

    if (normalized.length > 0) {
      return `${normalized}-${suffix}`;
    }

    return `REF-${Date.now()}-${suffix}`;
  }

  private resolveOperator(metadata: Record<string, unknown>, country: string): string {
    const metadataOperator = metadata.customerOperator;
    const countryOverride = this.configService.get<string>(`ZIKOPAY_OPERATOR_${country}`, '').trim();
    const globalDefault = this.configService.get<string>('ZIKOPAY_DEFAULT_OPERATOR', '').trim();
    const supportedByCountry = SUPPORTED_OPERATORS_BY_COUNTRY[country] || [];

    if (typeof metadataOperator === 'string' && metadataOperator.trim().length > 0) {
      return metadataOperator.trim();
    }

    if (countryOverride.length > 0) {
      return countryOverride;
    }

    if (globalDefault.length > 0) {
      return globalDefault;
    }

    if (supportedByCountry.length > 0) {
      return supportedByCountry[0];
    }

    throw new PaymentGatewayException(
      this.provider,
      `No ZikoPay operators configured for country ${country}.`,
    );
  }

  private resolveAndValidateOperator(
    metadata: Record<string, unknown>,
    country: string,
  ): string {
    const operator = this.resolveOperator(metadata, country);
    this.validateOperatorForCountry(operator, country);
    return operator;
  }

  private validateOperatorForCountry(operator: string, country: string): void {
    const supportedByCountry = SUPPORTED_OPERATORS_BY_COUNTRY[country] || [];

    if (supportedByCountry.length === 0) {
      throw new PaymentGatewayException(
        this.provider,
        `No ZikoPay operators configured for country ${country}.`,
      );
    }

    if (!supportedByCountry.includes(operator)) {
      throw new PaymentGatewayException(
        this.provider,
        `Operator ${operator} does not match country ${country}. Allowed: ${supportedByCountry.join(', ')}.`,
      );
    }
  }

  private resolvePaymentCurrency(
    requestedCurrency: Currency,
    walletCurrencies: Currency[],
    country: string,
  ): Currency {
    const forcedCurrency = parseCurrency(this.configService.get<string>('ZIKOPAY_FORCE_CURRENCY', ''));

    if (forcedCurrency) {
      if (walletCurrencies.length > 0 && !walletCurrencies.includes(forcedCurrency)) {
        throw new PaymentGatewayException(
          this.provider,
          `ZIKOPAY_FORCE_CURRENCY=${forcedCurrency} is not enabled on this account. Wallet currencies: ${walletCurrencies.join(', ')}.`,
        );
      }

      return forcedCurrency;
    }

    if (walletCurrencies.length === 0 || walletCurrencies.includes(requestedCurrency)) {
      return requestedCurrency;
    }

    const autoFallback =
      this.configService.get<string>('ZIKOPAY_AUTO_FALLBACK_CURRENCY', 'false') === 'true';

    if (!autoFallback) {
      throw new PaymentGatewayException(
        this.provider,
        `Requested currency ${requestedCurrency} is not enabled for country ${country}. Wallet currencies: ${walletCurrencies.join(', ')}. Enable ${requestedCurrency} wallet in ZikoPay or set ZIKOPAY_FORCE_CURRENCY explicitly.`,
      );
    }

    if (walletCurrencies.includes(Currency.XAF)) {
      return Currency.XAF;
    }

    return walletCurrencies[0];
  }

  private async fetchWalletCurrencies(
    baseUrl: string,
    apiKey: string,
    apiSecret: string,
  ): Promise<Currency[]> {
    const now = Date.now();

    if (this.walletCache && this.walletCache.expiresAt > now) {
      return this.walletCache.currencies;
    }

    try {
      const response = await axios.get(`${baseUrl}/wallet`, {
        headers: {
          'X-API-Key': apiKey,
          'X-API-Secret': apiSecret,
          Accept: 'application/json',
        },
        timeout: 8_000,
      });

      const wallets = Array.isArray((response.data as { wallets?: unknown[] }).wallets)
        ? ((response.data as { wallets: Array<{ currency?: unknown }> }).wallets ?? [])
        : [];

      const currencies = wallets
        .map((wallet) => parseCurrency(String(wallet.currency || '')))
        .filter((currency): currency is Currency => currency !== null);

      this.walletCache = {
        currencies,
        expiresAt: now + 60_000,
      };

      return currencies;
    } catch {
      return [];
    }
  }

}

function parseCurrency(raw: string): Currency | null {
  const normalized = raw.trim().toUpperCase();

  if (normalized === Currency.XAF) {
    return Currency.XAF;
  }

  if (normalized === Currency.XOF) {
    return Currency.XOF;
  }

  return null;
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function toOptionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function normalizePaymentStatus(rawStatus: string): InvoiceStatus {
  const status = rawStatus.toUpperCase();

  if (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'PAID'].includes(status)) {
    return InvoiceStatus.PAID;
  }

  if (['REFUND', 'REFUNDED'].includes(status)) {
    return InvoiceStatus.REFUNDED;
  }

  if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(status)) {
    return InvoiceStatus.FAILED;
  }

  return InvoiceStatus.PENDING;
}

function compareSignatures(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

function extractApiMessage(data: Record<string, any>): string | null {
  const message =
    (typeof data.message === 'string' && data.message.trim().length > 0
      ? data.message.trim()
      : null) ||
    (typeof data.data?.message === 'string' && data.data.message.trim().length > 0
      ? data.data.message.trim()
      : null);

  return message || null;
}

function extractProviderError(error: unknown): unknown {
  if (!error || typeof error !== 'object') {
    return error;
  }

  const candidate = error as {
    message?: string;
    response?: { status?: number; data?: unknown };
  };

  if (candidate.response) {
    return {
      status: candidate.response.status,
      data: candidate.response.data,
      message: candidate.message,
    };
  }

  return candidate.message || error;
}

function extractProviderMessage(providerError: unknown): string | null {
  if (!providerError || typeof providerError !== 'object') {
    return null;
  }

  const candidate = providerError as {
    message?: unknown;
    data?: { message?: unknown };
  };

  const dataMessage = candidate.data?.message;
  if (typeof dataMessage === 'string' && dataMessage.trim().length > 0) {
    return dataMessage.trim();
  }

  const message = candidate.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message.trim();
  }

  return null;
}
