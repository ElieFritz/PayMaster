import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';

import { LEGAL_MENTIONS, RECEIPT_TERMS } from '../common/constants/legal';
import { Invoice } from './invoice.entity';

type InvoiceLine = {
  category?: string;
  name?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
};

@Injectable()
export class InvoicePdfService {
  async generateInvoicePdf(invoice: Invoice): Promise<Buffer> {
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
    const lines = Array.isArray(invoice.metadata?.services)
      ? (invoice.metadata.services as InvoiceLine[])
      : [];

    const lineRows = lines
      .map((line) => {
        const quantity = Number(line.quantity || 0);
        const unitPrice = Number(line.unitPrice || 0);
        const lineTotal = quantity * unitPrice;

        return `
          <tr>
            <td>${escapeHtml(line.category || '-')}</td>
            <td>
              <div class="break-anywhere">${escapeHtml(line.name || '-')}</div>
              <div class="muted break-anywhere">${escapeHtml(line.description || '')}</div>
            </td>
            <td class="text-center">${quantity}</td>
            <td class="text-right">${formatAmount(unitPrice)} ${invoice.currency}</td>
            <td class="text-right">${formatAmount(lineTotal)} ${invoice.currency}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="UTF-8" />
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #151515; }
            .top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
            .brand { font-size: 24px; font-weight: 800; letter-spacing: 0.03em; }
            .invoice-title { font-size: 18px; font-weight: 700; margin-bottom: 6px; }
            .muted { color: #666; font-size: 12px; line-height: 1.5; }
            .panel { border: 1px solid #e3e3e3; border-radius: 10px; padding: 12px; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; table-layout: fixed; }
            th, td { border: 1px solid #e3e3e3; padding: 8px; font-size: 12px; vertical-align: top; }
            th { background: #f6f6f6; text-align: left; }
            .summary { margin-top: 18px; display: flex; justify-content: flex-end; }
            .summary-box { width: 280px; border: 1px solid #e3e3e3; border-radius: 10px; padding: 12px; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px; }
            .summary-total { display: flex; justify-content: space-between; margin-top: 10px; font-size: 16px; font-weight: 700; }
            .footer { margin-top: 24px; font-size: 11px; line-height: 1.6; }
            .break-anywhere { word-break: break-word; overflow-wrap: anywhere; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
          </style>
        </head>
        <body>
          <div class="top">
            <div>
              <div class="brand">THE PERFORMERS</div>
              <div class="muted">Agence digitale & publicitaire</div>
              <div class="muted">billing@boost-performers.com</div>
            </div>
            <div>
              <div class="invoice-title">FACTURE</div>
              <div class="muted break-anywhere">Reference: ${escapeHtml(invoice.reference)}</div>
              <div class="muted">Date emission: ${new Date(invoice.createdAt).toLocaleDateString('fr-FR')}</div>
              <div class="muted">Statut: ${escapeHtml(invoice.status)}</div>
            </div>
          </div>

          <div class="panel">
            <strong>Facture a:</strong>
            <div class="muted break-anywhere">${escapeHtml(invoice.customerName)}</div>
            <div class="muted break-anywhere">${escapeHtml(invoice.customerEmail)}</div>
            <div class="muted">Pays: ${escapeHtml(invoice.country)}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Service</th>
                <th class="text-center">Qte</th>
                <th class="text-right">Prix unitaire</th>
                <th class="text-right">Total ligne</th>
              </tr>
            </thead>
            <tbody>
              ${lineRows || '<tr><td colspan="5">Aucune ligne de service</td></tr>'}
            </tbody>
          </table>

          <div class="summary">
            <div class="summary-box">
              <div class="summary-row">
                <span>Sous-total</span>
                <span>${formatAmount(invoice.amount)} ${invoice.currency}</span>
              </div>
              <div class="summary-row">
                <span>TVA</span>
                <span>0 ${invoice.currency}</span>
              </div>
              <div class="summary-total">
                <span>Total a payer</span>
                <span>${formatAmount(invoice.amount)} ${invoice.currency}</span>
              </div>
            </div>
          </div>

          <div class="footer">
            <p class="break-anywhere"><strong>Mentions legales:</strong> ${escapeHtml(LEGAL_MENTIONS)}</p>
            <p class="break-anywhere"><strong>Conditions de remboursement:</strong> ${escapeHtml(RECEIPT_TERMS)}</p>
          </div>
        </body>
      </html>
    `;
  }
}

function formatAmount(value: number): string {
  return Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
