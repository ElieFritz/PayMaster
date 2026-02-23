import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';

import { PaymentProvider } from '../../common/enums/payment-provider.enum';

export class ProviderParamDto {
  @Transform(({ value }) => String(value).toUpperCase())
  @IsEnum(PaymentProvider)
  provider!: PaymentProvider;
}
