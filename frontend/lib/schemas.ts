import { z } from 'zod';

export const invoiceLineSchema = z.object({
  category: z.enum(['BOOST', 'WEB', 'ADS', 'OTHER']),
  name: z.string().min(2, 'Nom du service requis.'),
  description: z.string().optional(),
  quantity: z.number().min(1, 'Quantite minimale: 1'),
  unitPrice: z.number().min(0, 'Prix unitaire invalide'),
});

export const invoiceFormSchema = z.object({
  country: z.string().length(2),
  currency: z.enum(['XAF', 'XOF']),
  customerName: z.string().min(2, 'Nom client requis'),
  customerEmail: z.string().email('Email invalide'),
  lines: z.array(invoiceLineSchema).min(1, 'Ajoutez au moins un service'),
  metadata: z.object({
    projectName: z.string().optional(),
    notes: z.string().optional(),
    customerPhone: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().min(6, 'Telephone invalide').max(25).optional(),
    ),
    customerOperator: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().min(3, 'Operateur invalide').max(40).optional(),
    ),
  }),
}).superRefine((value, ctx) => {
  if (value.country !== 'CM') {
    if (!value.metadata.customerPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['metadata', 'customerPhone'],
        message: 'Telephone requis pour les paiements ZikoPay.',
      });
    }

    if (!value.metadata.customerOperator) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['metadata', 'customerOperator'],
        message: 'Operateur mobile money requis pour ZikoPay.',
      });
    }
  }
});

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

export type InvoiceStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type PaymentProvider = 'NOTCHPAY' | 'ZIKOPAY';

export type Invoice = {
  id: string;
  reference: string;
  amount: number;
  currency: 'XAF' | 'XOF';
  status: InvoiceStatus;
  country: string;
  customerName: string;
  customerEmail: string;
  paymentProvider?: PaymentProvider | null;
  paymentUrl?: string | null;
  transactionId?: string | null;
  metadata: {
    services?: Array<{
      category: 'BOOST' | 'WEB' | 'ADS' | 'OTHER';
      name: string;
      description?: string;
      quantity: number;
      unitPrice: number;
    }>;
    payment?: {
      providerReference?: string | null;
    };
    projectName?: string;
    notes?: string;
    customerPhone?: string;
    customerOperator?: string;
  };
  createdAt: string;
};

export type InvoicesResponse = {
  items: Invoice[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type InvoiceStats = {
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

export type PaymentTransaction = {
  id: string;
  invoiceId: string;
  reference: string;
  provider: PaymentProvider;
  providerTransactionId?: string | null;
  status: InvoiceStatus;
  amount: number;
  currency: 'XAF' | 'XOF';
  country: string;
  payerName?: string | null;
  payerEmail?: string | null;
  payerPhone?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentTransactionsResponse = {
  items: PaymentTransaction[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
