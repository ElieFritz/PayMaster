import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { Currency } from '../common/enums/currency.enum';
import { InvoiceStatus } from '../common/enums/invoice-status.enum';
import { PaymentProvider } from '../common/enums/payment-provider.enum';

@Entity({ name: 'invoices' })
@Index(['reference'], { unique: true })
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50 })
  reference!: string;

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

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.PENDING })
  status!: InvoiceStatus;

  @Column({ type: 'varchar', length: 2 })
  country!: string;

  @Column({ type: 'varchar', length: 120 })
  customerName!: string;

  @Column({ type: 'varchar', length: 120 })
  customerEmail!: string;

  @Column({ type: 'enum', enum: PaymentProvider, nullable: true })
  paymentProvider?: PaymentProvider | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  paymentUrl?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  transactionId?: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
