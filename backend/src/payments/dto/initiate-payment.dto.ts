import { IsOptional, IsString, IsUrl, IsUUID, Length } from 'class-validator';

export class InitiatePaymentDto {
  @IsUUID()
  invoiceId!: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
    require_tld: false,
  })
  successUrl?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
    require_tld: false,
  })
  cancelUrl?: string;
}
