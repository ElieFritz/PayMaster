import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Currency } from '../common/enums/currency.enum';
import { InvoiceStatus } from '../common/enums/invoice-status.enum';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { Invoice } from '../invoices/invoice.entity';

@Entity({ name: 'payment_transactions' })
@Index(['invoiceId'])
@Index(['status'])
@Index(['provider'])
@Index(['createdAt'])
@Index(['reference'])
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  invoiceId!: string;

  @ManyToOne(() => Invoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  invoice!: Invoice;

  @Column({ type: 'enum', enum: PaymentProvider })
  provider!: PaymentProvider;

  @Column({ type: 'varchar', length: 50 })
  reference!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  providerTransactionId?: string | null;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.PENDING })
  status!: InvoiceStatus;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: {
      to: (value?: number) => (value ?? 0).toFixed(2),
      from: (value: string) => Number(value),
    },
  })
  amount!: number;

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;

  @Column({ type: 'varchar', length: 2 })
  country!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  checkoutUrl?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  payerName?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  payerEmail?: string | null;

  @Column({ type: 'varchar', length: 25, nullable: true })
  payerPhone?: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  rawInitiation!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  rawWebhook!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

