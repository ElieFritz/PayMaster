import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() createInvoiceDto: CreateInvoiceDto): Promise<Invoice> {
    return this.invoicesService.create(createInvoiceDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  list(@Query() query: ListInvoicesQueryDto) {
    return this.invoicesService.list(query);
  }

  @Get('stats/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  getStats() {
    return this.invoicesService.getStats();
  }

  @Get('reference/:reference')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  findByReference(@Param() params: InvoiceReferenceParamDto): Promise<Invoice> {
    return this.invoicesService.findOneByReference(params.reference);
  }

  @Get('public/reference/:reference')
  findPublicByReference(@Param() params: InvoiceReferenceParamDto): Promise<Invoice> {
    return this.invoicesService.findOneByReference(params.reference);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param() params: InvoiceIdParamDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const invoice = await this.invoicesService.findOneById(params.id);
    const pdfBuffer = await this.invoicesService.generatePdf(params.id);
    const filename = `invoice-${invoice.reference}.pdf`;

    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': buildAttachmentContentDisposition(filename),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });

    return new StreamableFile(pdfBuffer);
  }

  @Get(':id')
  findOne(@Param() params: InvoiceIdParamDto): Promise<Invoice> {
    return this.invoicesService.findOneById(params.id);
  }
}

function buildAttachmentContentDisposition(filename: string): string {
  const sanitized = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  const encoded = encodeURIComponent(sanitized);
  return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}
