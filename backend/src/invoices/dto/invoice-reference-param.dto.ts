import { IsString, Length } from 'class-validator';

export class InvoiceReferenceParamDto {
  @IsString()
  @Length(5, 50)
  reference!: string;
}