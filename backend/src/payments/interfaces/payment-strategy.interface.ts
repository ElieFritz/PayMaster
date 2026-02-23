import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { PaymentProvider } from '../../common/enums/payment-provider.enum';
import { Currency } from '../../common/enums/currency.enum';
import { Invoice } from '../../invoices/invoice.entity';

export interface PaymentInitializationInput {
  invoice: Invoice;
  successUrl?: string;
  cancelUrl?: string;
}

export interface PaymentInitializationResult {
  provider: PaymentProvider;
  currency?: Currency;
  providerReference?: string;
  checkoutUrl?: string;
  transactionId?: string;
  raw: Record<string, unknown>;
}

export interface PaymentStatusSyncResult {
  status: InvoiceStatus;
  reference?: string;
  transactionId?: string;
  amount?: number;
  currency?: string;
  raw: Record<string, unknown>;
}

export interface PaymentWebhookEvent {
  status: InvoiceStatus;
  reference?: string;
  transactionId?: string;
  payer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  amount?: number;
  currency?: string;
  raw: Record<string, unknown>;
}

export interface PaymentStrategy {
  readonly provider: PaymentProvider;

  supportsCountry(country: string): boolean;

  initializePayment(
    input: PaymentInitializationInput,
  ): Promise<PaymentInitializationResult>;

  fetchPaymentStatus?(reference: string): Promise<PaymentStatusSyncResult>;

  validateWebhookSignature(
    rawBody: Buffer,
    signature: string | undefined,
    secret: string,
  ): boolean;

  parseWebhookPayload(payload: Record<string, unknown>): PaymentWebhookEvent;
}
