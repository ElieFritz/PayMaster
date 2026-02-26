import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { InvoiceStatus } from '../../common/enums/invoice-status.enum';

export const MANUAL_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const;

export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export class ManualUpdateInvoiceStatusDto {
  @IsEnum(InvoiceStatus)
  status!: InvoiceStatus;

  @IsOptional()
  @IsIn(MANUAL_PAYMENT_METHODS)
  paymentMethod?: ManualPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;

  @IsOptional()
  @IsBoolean()
  sendReceipt?: boolean;
}
