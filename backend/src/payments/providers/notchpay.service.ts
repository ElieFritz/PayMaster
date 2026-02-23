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
  PaymentStrategy,
  PaymentWebhookEvent,
} from '../interfaces/payment-strategy.interface';

@Injectable()
export class NotchPayService implements PaymentStrategy {
  readonly provider = PaymentProvider.NOTCHPAY;

  constructor(private readonly configService: ConfigService) {}

  supportsCountry(country: string): boolean {
    return country.toUpperCase() === 'CM';
  }

  async initializePayment(
    input: PaymentInitializationInput,
  ): Promise<PaymentInitializationResult> {
    const mockMode = this.configService.get<string>('PAYMENT_PROVIDER_MOCK', 'false') === 'true';
    const baseUrl = this.configService.get<string>('NOTCHPAY_BASE_URL', 'https://api.notchpay.co');
    const apiKey = this.configService.get<string>('NOTCHPAY_API_KEY', '');

    if (mockMode) {
      return {
        provider: this.provider,
        currency: Currency.XAF,
        providerReference: input.invoice.reference,
        checkoutUrl: `${baseUrl}/checkout/mock/${input.invoice.reference}`,
        transactionId: `mock-notch-${input.invoice.id}`,
        raw: { mockMode: true },
      };
    }

    if (!apiKey) {
      throw new PaymentGatewayException(
        this.provider,
        'NOTCHPAY_API_KEY is missing. Set it or enable PAYMENT_PROVIDER_MOCK=true.',
      );
    }

    const amount = Math.round(Number(input.invoice.amount));
    const forcedCurrency = Currency.XAF;

    try {
      const response = await axios.post(
        `${baseUrl}/payments`,
        {
          amount,
          currency: forcedCurrency,
          reference: input.invoice.reference,
          email: input.invoice.customerEmail,
          customer: {
            name: input.invoice.customerName,
            email: input.invoice.customerEmail,
          },
          description: `Invoice ${input.invoice.reference}`,
          callback: input.successUrl,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          metadata: {
            invoiceId: input.invoice.id,
            reference: input.invoice.reference,
          },
        },
        {
          headers: {
            Authorization: apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 12_000,
        },
      );

      const data = response.data as Record<string, any>;
      const transaction = data.transaction || data.data?.transaction || data.data;
      const checkoutUrl =
        data.authorization_url ||
        data.checkout_url ||
        data.payment_url ||
        data.data?.authorization_url ||
        data.data?.checkout_url ||
        transaction?.authorization_url;

      if (!checkoutUrl) {
        throw new Error('Missing checkout URL in NotchPay response.');
      }

      return {
        provider: this.provider,
        currency: forcedCurrency,
        providerReference: input.invoice.reference,
        checkoutUrl,
        transactionId:
          transaction?.id || data.transaction_id || data.id || data.data?.id || input.invoice.reference,
        raw: data,
      };
    } catch (error) {
      throw new PaymentGatewayException(
        this.provider,
        'Unable to initialize NotchPay transaction.',
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
    const transaction = (data.transaction as Record<string, unknown>) || {};
    const customer =
      (payload.customer as Record<string, unknown>) ||
      (data.customer as Record<string, unknown>) ||
      {};

    const statusRaw =
      (payload.status as string) ||
      (data.status as string) ||
      ((payload.event as string) ?? '') ||
      ((payload.type as string) ?? '');

    return {
      status: normalizePaymentStatus(statusRaw),
      reference:
        (payload.reference as string) ||
        (data.reference as string) ||
        ((data.metadata as Record<string, unknown>)?.reference as string) ||
        ((payload.metadata as Record<string, unknown>)?.reference as string),
      transactionId:
        (payload.transaction_id as string) ||
        (data.id as string) ||
        (transaction.id as string),
      payer: {
        name: (customer.name as string) || (customer.full_name as string),
        email: (customer.email as string),
        phone: (customer.phone as string),
      },
      amount: Number((payload.amount as number) || (data.amount as number) || 0) || undefined,
      currency: (payload.currency as string) || (data.currency as string),
      raw: payload,
    };
  }
}

function normalizePaymentStatus(rawStatus: string): InvoiceStatus {
  const status = rawStatus.toUpperCase();

  if (
    [
      'SUCCESS',
      'SUCCEEDED',
      'COMPLETED',
      'COMPLETE',
      'PAID',
      'PAYMENT.COMPLETE',
      'PAYMENT.COMPLETED',
      'PAYMENT.SUCCEEDED',
      'PAYMENT.SUCCESS',
    ].includes(status)
  ) {
    return InvoiceStatus.PAID;
  }

  if (['REFUND', 'REFUNDED', 'PAYMENT.REFUND', 'PAYMENT.REFUNDED'].includes(status)) {
    return InvoiceStatus.REFUNDED;
  }

  if (
    [
      'FAILED',
      'FAIL',
      'CANCELLED',
      'CANCELED',
      'EXPIRED',
      'PAYMENT.FAILED',
      'PAYMENT.CANCELLED',
      'PAYMENT.CANCELED',
      'PAYMENT.EXPIRED',
    ].includes(status)
  ) {
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
