import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  CEMAC_COUNTRY_CODES,
  SUPPORTED_CEMAC_COUNTRIES_LABEL,
} from '../../common/constants/countries';
import { Currency } from '../../common/enums/currency.enum';
import { InvoiceLineDto, InvoiceMetadataDto, ServiceCategory } from './invoice-line.dto';

class CreateInvoiceLineDto implements InvoiceLineDto {
  @IsEnum(ServiceCategory)
  category!: ServiceCategory;

  @IsString()
  @Length(2, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @Type(() => Number)
  @Min(1)
  @Max(10_000)
  quantity!: number;

  @Type(() => Number)
  @Min(0)
  @Max(1_000_000_000)
  unitPrice!: number;
}

class CreateInvoiceMetadataDto implements InvoiceMetadataDto {
  @IsOptional()
  @IsString()
  @Length(2, 150)
  projectName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;

  @IsOptional()
  @IsString()
  @Length(6, 25)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @Length(3, 40)
  customerOperator?: string;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  @Length(5, 50)
  reference?: string;

  @IsString()
  @Length(2, 2)
  @IsIn(CEMAC_COUNTRY_CODES, {
    message: `Country must be one of: ${SUPPORTED_CEMAC_COUNTRIES_LABEL}.`,
  })
  country!: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsString()
  @Length(2, 120)
  customerName!: string;

  @IsEmail()
  customerEmail!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines!: CreateInvoiceLineDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateInvoiceMetadataDto)
  metadata?: CreateInvoiceMetadataDto;
}
