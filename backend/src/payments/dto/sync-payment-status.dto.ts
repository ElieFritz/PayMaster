import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

import { PaymentProvider } from '../../common/enums/payment-provider.enum';

export class SyncPaymentStatusDto {
  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;

  @IsOptional()
  @IsString()
  @Length(3, 120)
  providerReference?: string;
}
