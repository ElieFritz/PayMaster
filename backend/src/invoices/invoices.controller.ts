import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';

import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceIdParamDto } from './dto/invoice-id-param.dto';
import { InvoiceReferenceParamDto } from './dto/invoice-reference-param.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { Invoice } from './invoice.entity';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  create(@Body() createInvoiceDto: CreateInvoiceDto): Promise<Invoice> {
    return this.invoicesService.create(createInvoiceDto);
  }

  @Get()
  list(@Query() query: ListInvoicesQueryDto) {
    return this.invoicesService.list(query);
  }

  @Get('stats/overview')
  getStats() {
    return this.invoicesService.getStats();
  }

  @Get('reference/:reference')
  findByReference(@Param() params: InvoiceReferenceParamDto): Promise<Invoice> {
    return this.invoicesService.findOneByReference(params.reference);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param() params: InvoiceIdParamDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const invoice = await this.invoicesService.findOneById(params.id);
    const pdfBuffer = await this.invoicesService.generatePdf(params.id);

    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=\"invoice-${invoice.reference}.pdf\"`,
      'Cache-Control': 'no-store',
    });

    return new StreamableFile(pdfBuffer);
  }

  @Get(':id')
  findOne(@Param() params: InvoiceIdParamDto): Promise<Invoice> {
    return this.invoicesService.findOneById(params.id);
  }
}
