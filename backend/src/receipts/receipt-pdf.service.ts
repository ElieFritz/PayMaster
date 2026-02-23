import { Injectable } from '@nestjs/common';
import { LEGAL_MENTIONS, RECEIPT_TERMS } from '../common/constants/legal';
import { Invoice } from '../invoices/invoice.entity';
import puppeteer from 'puppeteer';

@Injectable()
export class ReceiptPdfService {
  async generatePdf(invoice: Invoice): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(this.renderHtml(invoice), { waitUntil: 'networkidle0' });

      const pdfBytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '24px',
          right: '24px',
          bottom: '24px',
          left: '24px',
        },
      });

      return Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
    } finally {
      await browser.close();
    }
  }

  private renderHtml(invoice: Invoice): string {
    const services = Array.isArray(invoice.metadata?.services)
      ? (invoice.metadata.services as Array<Record<string, unknown>>)
      : [];

    const servicesRows = services
      .map(
        (line) => `
          <tr>
            <td>${line.category || '-'}</td>
            <td>${line.name || '-'}</td>
            <td>${line.quantity || 0}</td>
            <td>${line.unitPrice || 0}</td>
          </tr>
        `,
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="UTF-8" />
          <style>
            body { font-family: Arial, sans-serif; color: #111; }
            .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
            .title { font-size: 24px; font-weight: 700; }
            .muted { color: #666; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #e2e2e2; padding: 8px; font-size: 12px; }
            th { background: #f5f5f5; text-align: left; }
            .summary { margin-top: 20px; text-align: right; font-size: 16px; font-weight: 700; }
            .legal { margin-top: 28px; font-size: 11px; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">The Performers - Recu de Paiement</div>
              <div class="muted">Reference: ${invoice.reference}</div>
              <div class="muted">Date: ${new Date().toLocaleDateString('fr-FR')}</div>
            </div>
            <div>
              <div class="muted">Client: ${invoice.customerName}</div>
              <div class="muted">Email: ${invoice.customerEmail}</div>
              <div class="muted">Pays: ${invoice.country}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Service</th>
                <th>Quantite</th>
                <th>Prix unitaire</th>
              </tr>
            </thead>
            <tbody>
              ${servicesRows || '<tr><td colspan="4">Aucune ligne detaillee</td></tr>'}
            </tbody>
          </table>

          <div class="summary">Total: ${invoice.amount.toFixed(2)} ${invoice.currency}</div>

          <div class="legal">
            <p><strong>Mentions Legales:</strong> ${LEGAL_MENTIONS}</p>
            <p><strong>Conditions Generales (T&C):</strong> ${RECEIPT_TERMS}</p>
          </div>
        </body>
      </html>
    `;
  }
}
