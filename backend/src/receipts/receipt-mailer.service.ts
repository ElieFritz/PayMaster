import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { RECEIPT_TERMS } from '../common/constants/legal';
import { Invoice } from '../invoices/invoice.entity';

@Injectable()
export class ReceiptMailerService {
  constructor(private readonly configService: ConfigService) {}

  async sendInvoiceReceipt(invoice: Invoice, pdfBuffer: Buffer): Promise<void> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY', '').trim();
    const from = this.configService
      .get<string>(
        'RESEND_FROM',
        this.configService.get<string>('SMTP_FROM', 'no-reply@boost-performers.com'),
      )
      .trim();

    if (!apiKey) {
      throw new Error('Missing RESEND_API_KEY configuration.');
    }

    await axios.post(
      'https://api.resend.com/emails',
      {
        from,
        to: [invoice.customerEmail],
        subject: `Recu de paiement - ${invoice.reference}`,
        html: `
          <p>Bonjour ${invoice.customerName},</p>
          <p>Votre paiement pour la facture <strong>${invoice.reference}</strong> a bien ete recu.</p>
          <p>Le recu PDF est joint a ce message.</p>
          <p><strong>Rappel T&C:</strong> ${RECEIPT_TERMS}</p>
          <p>Equipe The Performers</p>
        `,
        attachments: [
          {
            filename: `receipt-${invoice.reference}.pdf`,
            content: pdfBuffer.toString('base64'),
            type: 'application/pdf',
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );
  }
}
