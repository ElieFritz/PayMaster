import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { UserRole } from '../common/enums/user-role.enum';
import { InvoiceIdParamDto } from '../invoices/dto/invoice-id-param.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { ListPaymentTransactionsQueryDto } from './dto/list-payment-transactions-query.dto';
import { ManualUpdateInvoiceStatusDto } from './dto/manual-update-invoice-status.dto';
import { SyncPaymentStatusDto } from './dto/sync-payment-status.dto';
import { PaymentTransaction } from './payment-transaction.entity';
import { PaymentsService } from './payments.service';
import { PaymentTransactionsService } from './payment-transactions.service';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paymentTransactionsService: PaymentTransactionsService,
  ) {}

  @Post('initiate')
  initiatePayment(@Body() initiatePaymentDto: InitiatePaymentDto) {
    return this.paymentsService.initiatePayment(initiatePaymentDto);
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  listTransactions(@Query() query: ListPaymentTransactionsQueryDto) {
    return this.paymentTransactionsService.list(query);
  }

  @Get('transactions/export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async exportTransactions(
    @Query() query: ListPaymentTransactionsQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const items = await this.paymentTransactionsService.list({
      ...query,
      page: query.page ?? 1,
      limit: query.limit ?? 1000,
    });

    response.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="payment-transactions.csv"',
      'Cache-Control': 'no-store',
    });

    return this.buildCsv(items.items);
  }

  @Get('invoices/:id/transactions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  listInvoiceTransactions(@Param() params: InvoiceIdParamDto) {
    return this.paymentTransactionsService.listByInvoice(params.id);
  }

  @Post('invoices/:id/sync-status')
  syncInvoiceStatus(
    @Param() params: InvoiceIdParamDto,
    @Body() body: SyncPaymentStatusDto,
  ) {
    return this.paymentsService.syncInvoiceStatus(params.id, body);
  }

  @Post('invoices/:id/send-receipt')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  sendReceipt(@Param() params: InvoiceIdParamDto) {
    return this.paymentsService.resendReceipt(params.id);
  }

  @Post('invoices/:id/manual-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  manualUpdateInvoiceStatus(
    @Param() params: InvoiceIdParamDto,
    @Body() body: ManualUpdateInvoiceStatusDto,
    @Req() request: RequestWithUser,
  ) {
    return this.paymentsService.manualUpdateInvoiceStatus(
      params.id,
      body,
      request.user?.email || null,
    );
  }

  private buildCsv(items: PaymentTransaction[]): string {
    const headers = [
      'id',
      'invoiceId',
      'reference',
      'provider',
      'providerTransactionId',
      'status',
      'amount',
      'currency',
      'country',
      'payerName',
      'payerEmail',
      'payerPhone',
      'paidAt',
      'createdAt',
      'updatedAt',
    ];

    const rows = items.map((item) => [
      item.id,
      item.invoiceId,
      item.reference,
      item.provider,
      item.providerTransactionId || '',
      item.status,
      item.amount,
      item.currency,
      item.country,
      item.payerName || '',
      item.payerEmail || '',
      item.payerPhone || '',
      item.paidAt?.toISOString() || '',
      item.createdAt.toISOString(),
      item.updatedAt.toISOString(),
    ]);

    return [headers, ...rows]
      .map((row) => row.map((value) => this.escapeCsvValue(value)).join(','))
      .join('\n');
  }

  private escapeCsvValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '""';
    }

    const normalized = String(value).replace(/"/g, '""');
    return `"${normalized}"`;
  }
}
