import { Injectable } from '@nestjs/common';
import { LEGAL_MENTIONS, RECEIPT_TERMS } from '../common/constants/legal';
import { launchPdfBrowser } from '../common/utils/puppeteer-browser';
import { Invoice } from '../invoices/invoice.entity';

@Injectable()
export class ReceiptPdfService {
  async generatePdf(invoice: Invoice): Promise<Buffer> {
    const browser = await launchPdfBrowser();

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
    const lines = this.resolveInvoiceLines(invoice);
    const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
    const calculatedSubtotal = lines.length > 0 ? subtotal : Number(invoice.amount);
    const metadata = invoice.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {};
    const projectName = this.resolveOptionalString(metadata.projectName);
    const note = this.resolveOptionalString(metadata.notes);
    const paymentMetadata =
      metadata.payment && typeof metadata.payment === 'object'
        ? (metadata.payment as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    const providerReference =
      this.resolveOptionalString(paymentMetadata.providerReference) ||
      this.resolveOptionalString(invoice.transactionId) ||
      invoice.reference;

    const rowsHtml =
      lines.length > 0
        ? lines
            .map((line, index) => {
              const rowClass = index % 2 === 0 ? 'row-even' : 'row-odd';

              return `
                <tr class="${rowClass}">
                  <td>${this.escapeHtml(line.category)}</td>
                  <td class="break-anywhere">${this.escapeHtml(line.name)}</td>
                  <td class="text-center">${line.quantity}</td>
                  <td class="text-right">${this.formatAmount(line.unitPrice)} ${invoice.currency}</td>
                  <td class="text-right strong">${this.formatAmount(line.total)} ${invoice.currency}</td>
                </tr>
              `;
            })
            .join('')
        : `
          <tr class="row-even">
            <td colspan="5">Facture globale sans lignes detaillees.</td>
          </tr>
        `;

    return `
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="UTF-8" />
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              font-family: "Segoe UI", Arial, sans-serif;
              color: #102a5f;
              background: #edf3ff;
            }
            .sheet {
              max-width: 100%;
              border: 1px solid #cadbff;
              border-radius: 18px;
              overflow: hidden;
              background: #ffffff;
              box-shadow: 0 10px 24px rgba(10, 40, 100, 0.12);
            }
            .hero {
              padding: 24px 26px 20px 26px;
              background: linear-gradient(130deg, #0d3c9f 0%, #1767e6 55%, #2d89f7 100%);
            }
            .hero-top {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
            }
            .brand {
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .brand-mark {
              width: 44px;
              height: 44px;
              border-radius: 12px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              background: rgba(255, 255, 255, 0.2);
              border: 1px solid rgba(255, 255, 255, 0.45);
              color: #ffffff;
              font-size: 18px;
              font-weight: 800;
              letter-spacing: 0.08em;
            }
            .brand-name {
              color: #ffffff;
              font-size: 20px;
              font-weight: 800;
              line-height: 1.1;
            }
            .brand-sub {
              margin-top: 3px;
              color: #d9e8ff;
              font-size: 11px;
              letter-spacing: 0.12em;
              text-transform: uppercase;
            }
            .status-badge {
              display: inline-flex;
              align-items: center;
              border-radius: 999px;
              padding: 6px 10px;
              border: 1px solid rgba(255, 255, 255, 0.4);
              background: rgba(255, 255, 255, 0.2);
              color: #ffffff;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.07em;
            }
            .hero-title {
              margin: 16px 0 0 0;
              color: #ffffff;
              font-size: 28px;
              font-weight: 800;
              line-height: 1.2;
            }
            .hero-meta {
              margin: 8px 0 0 0;
              color: #d9e8ff;
              font-size: 12px;
            }
            .identity-grid {
              margin-top: 14px;
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 6px 14px;
              color: #e8f1ff;
              font-size: 11px;
            }
            .identity-grid strong {
              color: #ffffff;
              font-weight: 700;
            }
            .content {
              padding: 18px 22px 16px 22px;
            }
            .cards {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 12px;
              margin-bottom: 14px;
            }
            .card {
              border: 1px solid #d8e5ff;
              border-radius: 14px;
              background: #f6f9ff;
              padding: 12px;
            }
            .card-label {
              margin: 0 0 6px 0;
              color: #5272aa;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.08em;
            }
            .card-main {
              margin: 0;
              color: #123c8c;
              font-size: 14px;
              font-weight: 700;
              line-height: 1.4;
            }
            .card-sub {
              margin: 4px 0 0 0;
              color: #5f76a2;
              font-size: 11px;
              line-height: 1.4;
            }
            .table-wrap {
              border: 1px solid #d8e5ff;
              border-radius: 14px;
              overflow: hidden;
            }
            .table-title {
              margin: 0;
              padding: 10px 12px;
              background: #eef4ff;
              border-bottom: 1px solid #d8e5ff;
              color: #4f6da2;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              font-weight: 700;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }
            th, td {
              padding: 9px 10px;
              font-size: 12px;
              border-bottom: 1px solid #dce8ff;
              color: #2f4e80;
              word-break: break-word;
              overflow-wrap: anywhere;
            }
            th {
              background: #f4f8ff;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              font-size: 10px;
              color: #5676ac;
              text-align: left;
            }
            .row-even td { background: #ffffff; }
            .row-odd td { background: #f9fbff; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .strong { color: #103985; font-weight: 700; }
            .summary-box {
              margin-top: 14px;
              margin-left: auto;
              width: 280px;
              border: 1px solid #cadbff;
              border-radius: 14px;
              background: linear-gradient(180deg, #f8fbff 0%, #edf4ff 100%);
              padding: 12px 14px;
            }
            .summary-row {
              display: flex;
              justify-content: space-between;
              gap: 10px;
              margin-top: 8px;
              color: #3f5f95;
              font-size: 12px;
            }
            .summary-row.total {
              margin-top: 10px;
              padding-top: 10px;
              border-top: 1px solid #cfdeff;
              color: #103985;
              font-size: 16px;
              font-weight: 800;
            }
            .client-note {
              margin-top: 12px;
              border: 1px dashed #c8d9ff;
              border-radius: 12px;
              background: #f8fbff;
              padding: 10px 12px;
              color: #4d6899;
              font-size: 11px;
              line-height: 1.5;
            }
            .footer {
              margin-top: 14px;
              border-top: 1px solid #deebff;
              padding-top: 10px;
              color: #60749a;
              font-size: 9px;
              line-height: 1.5;
            }
            .footer p {
              margin: 0 0 5px 0;
            }
            .break-anywhere {
              word-break: break-word;
              overflow-wrap: anywhere;
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="hero">
              <div class="hero-top">
                <div class="brand">
                  <div class="brand-mark">BP</div>
                  <div>
                    <div class="brand-name">Boost Performers</div>
                    <div class="brand-sub">Recu de paiement officiel</div>
                  </div>
                </div>
                <div class="status-badge">PAIEMENT CONFIRME</div>
              </div>
              <h1 class="hero-title break-anywhere">Facture ${this.escapeHtml(invoice.reference)}</h1>
              <p class="hero-meta">Emission: ${this.formatDate(invoice.createdAt)} | Confirmation: ${this.formatDate(new Date())}</p>
              <div class="identity-grid">
                <div><strong>RCCM:</strong> CM-TPR-2026-B-00123</div>
                <div><strong>NIU:</strong> M092612345678A</div>
                <div><strong>Siege:</strong> Douala, Cameroun</div>
                <div><strong>Site:</strong> www.boost-performers.com</div>
              </div>
            </div>

            <div class="content">
              <div class="cards">
                <div class="card">
                  <p class="card-label">Facture a</p>
                  <p class="card-main break-anywhere">${this.escapeHtml(invoice.customerName)}</p>
                  <p class="card-sub break-anywhere">${this.escapeHtml(invoice.customerEmail)}<br/>Pays: ${this.escapeHtml(invoice.country)}</p>
                </div>
                <div class="card">
                  <p class="card-label">Projet</p>
                  <p class="card-main break-anywhere">${this.escapeHtml(projectName || 'Prestation digitale')}</p>
                  <p class="card-sub break-anywhere">Reference paiement: ${this.escapeHtml(providerReference)}</p>
                </div>
                <div class="card">
                  <p class="card-label">Montant recu</p>
                  <p class="card-main">${this.formatAmount(invoice.amount)} ${invoice.currency}</p>
                  <p class="card-sub">Statut: PAID</p>
                </div>
              </div>

              <div class="table-wrap">
                <p class="table-title">Details de la facture</p>
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Service</th>
                      <th class="text-center">Qte</th>
                      <th class="text-right">PU</th>
                      <th class="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsHtml}
                  </tbody>
                </table>
              </div>

              <div class="summary-box">
                <div class="summary-row">
                  <span>Sous-total</span>
                  <span>${this.formatAmount(calculatedSubtotal)} ${invoice.currency}</span>
                </div>
                <div class="summary-row">
                  <span>Lignes facturees</span>
                  <span>${lines.length > 0 ? lines.length : 1}</span>
                </div>
                <div class="summary-row total">
                  <span>Montant total</span>
                  <span>${this.formatAmount(invoice.amount)} ${invoice.currency}</span>
                </div>
              </div>

              ${note ? `<div class="client-note"><strong>Note client:</strong> ${this.escapeHtml(note)}</div>` : ''}

              <div class="footer">
                <p><strong>Mentions legales:</strong> ${this.escapeHtml(LEGAL_MENTIONS)}</p>
                <p><strong>Conditions de remboursement:</strong> ${this.escapeHtml(RECEIPT_TERMS)}</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private resolveInvoiceLines(invoice: Invoice): Array<{
    category: string;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }> {
    const services = Array.isArray(invoice.metadata?.services)
      ? (invoice.metadata.services as Array<Record<string, unknown>>)
      : [];

    return services.map((line, index) => {
      const category = this.resolveCategoryLabel(this.resolveOptionalString(line.category) || 'OTHER');
      const name = this.resolveOptionalString(line.name) || `Service ${index + 1}`;
      const quantity = this.toPositiveNumber(line.quantity, 1);
      const unitPrice = this.toPositiveNumber(line.unitPrice, 0);

      return {
        category,
        name,
        quantity,
        unitPrice,
        total: quantity * unitPrice,
      };
    });
  }

  private resolveCategoryLabel(category: string): string {
    const normalized = category.toUpperCase();

    if (normalized === 'BOOST') {
      return 'Boost';
    }
    if (normalized === 'WEB') {
      return 'Web';
    }
    if (normalized === 'ADS') {
      return 'Ads';
    }

    return 'Autre';
  }

  private toPositiveNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }

    return parsed;
  }

  private resolveOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private formatAmount(value: number): string {
    return Number(value).toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  private formatDate(value: Date): string {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
