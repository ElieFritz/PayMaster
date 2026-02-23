import { IsIn, IsOptional, IsString, IsUrl, IsUUID, Length } from 'class-validator';

import {
  CEMAC_COUNTRY_CODES,
  SUPPORTED_CEMAC_COUNTRIES_LABEL,
} from '../../common/constants/countries';

export class InitiatePaymentDto {
  @IsUUID()
  invoiceId!: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  @IsIn(CEMAC_COUNTRY_CODES, {
    message: `Country must be one of: ${SUPPORTED_CEMAC_COUNTRIES_LABEL}.`,
  })
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
