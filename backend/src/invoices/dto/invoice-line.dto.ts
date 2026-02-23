import { Currency } from '../../common/enums/currency.enum';

export enum ServiceCategory {
  BOOST = 'BOOST',
  WEB = 'WEB',
  ADS = 'ADS',
  OTHER = 'OTHER',
}

export class InvoiceLineDto {
  category!: ServiceCategory;
  name!: string;
  description?: string;
  quantity!: number;
  unitPrice!: number;
}

export class InvoiceMetadataDto {
  projectName?: string;
  notes?: string;
  customerPhone?: string;
  customerOperator?: string;
}
