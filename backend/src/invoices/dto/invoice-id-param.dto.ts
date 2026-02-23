import { IsUUID } from 'class-validator';

export class InvoiceIdParamDto {
  @IsUUID()
  id!: string;
}