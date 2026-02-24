import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { LEGAL_MENTIONS, RECEIPT_TERMS } from '../common/constants/legal';
import { Invoice } from '../invoices/invoice.entity';

@Injectable()
export class ReceiptMailerService {
  constructor(private readonly configService: ConfigService) {}

  async sendInvoiceReceipt(invoice: Invoice, pdfBuffer?: Buffer): Promise<void> {
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

    const frontendBaseUrl = this.resolveFrontendBaseUrl();
    const invoiceLink = frontendBaseUrl
      ? `${frontendBaseUrl}/p/${encodeURIComponent(invoice.reference)}`
      : 'https://www.boost-performers.com';
    const lineItems = this.resolveInvoiceLines(invoice);
    const subtotal = lineItems.reduce(
      (sum, line) => sum + Number(line.quantity) * Number(line.unitPrice),
      0,
    );
    const summaryAmount = lineItems.length > 0 ? subtotal : Number(invoice.amount);
    const lineItemsHtml =
      lineItems.length > 0
        ? lineItems
            .map((line, index) => {
              const lineTotal = Number(line.quantity) * Number(line.unitPrice);
              const rowBackground = index % 2 === 0 ? '#f8fbff' : '#eef4ff';

              return `
                <tr>
                  <td style="padding:10px 12px;border-bottom:1px solid #d6e3ff;background:${rowBackground};font-size:13px;color:#0f2e6d;font-weight:600;word-break:break-word;overflow-wrap:anywhere;">${this.escapeHtml(line.name)}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #d6e3ff;background:${rowBackground};font-size:13px;color:#375282;text-align:center;">${line.quantity}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #d6e3ff;background:${rowBackground};font-size:13px;color:#375282;text-align:right;">${this.formatAmount(line.unitPrice)} ${invoice.currency}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #d6e3ff;background:${rowBackground};font-size:13px;color:#10337e;text-align:right;font-weight:700;">${this.formatAmount(lineTotal)} ${invoice.currency}</td>
                </tr>
              `;
            })
            .join('')
        : `
          <tr>
            <td colspan="4" style="padding:14px 12px;border-bottom:1px solid #d6e3ff;background:#f8fbff;font-size:13px;color:#3a5484;">
              Facture globale sans lignes detaillees.
            </td>
          </tr>
        `;
    const html = this.renderHtml({
      invoice,
      invoiceLink,
      lineItemsHtml,
      summaryAmount,
      pdfAttached: Boolean(pdfBuffer),
    });
    const text = this.renderText(invoice, invoiceLink, Boolean(pdfBuffer));
    const payload: Record<string, unknown> = {
      from,
      to: [invoice.customerEmail],
      subject: `Recu de paiement - ${invoice.reference}`,
      html,
      text,
    };

    if (pdfBuffer) {
      payload.attachments = [
        {
          filename: `receipt-${invoice.reference}.pdf`,
          content: pdfBuffer.toString('base64'),
          type: 'application/pdf',
        },
      ];
    }

    await axios.post(
      'https://api.resend.com/emails',
      payload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );
  }

  private resolveFrontendBaseUrl(): string | null {
    const raw = this.configService.get<string>(
      'PUBLIC_BILLING_URL',
      this.configService.get<string>('FRONTEND_URL', ''),
    );
    const firstOrigin = raw
      .split(',')
      .map((item) => item.trim())
      .find((item) => item.length > 0);

    if (!firstOrigin) {
      return null;
    }

    try {
      const parsed = new URL(firstOrigin);
      return parsed.origin.replace(/\/+$/, '');
    } catch {
      return null;
    }
  }

  private resolveInvoiceLines(invoice: Invoice): Array<{ name: string; quantity: number; unitPrice: number }> {
    const services = Array.isArray(invoice.metadata?.services) ? invoice.metadata.services : [];

    return services.map((service, index) => {
      const source =
        service && typeof service === 'object' ? (service as Record<string, unknown>) : ({} as Record<string, unknown>);

      const nameRaw = source.name;
      const quantityRaw = source.quantity;
      const unitPriceRaw = source.unitPrice;

      const name =
        typeof nameRaw === 'string' && nameRaw.trim().length > 0
          ? nameRaw.trim()
          : `Service ${index + 1}`;
      const quantity = Number.isFinite(Number(quantityRaw)) ? Number(quantityRaw) : 1;
      const unitPrice = Number.isFinite(Number(unitPriceRaw)) ? Number(unitPriceRaw) : 0;

      return {
        name,
        quantity,
        unitPrice,
      };
    });
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
    }).format(value);
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private renderHtml(input: {
    invoice: Invoice;
    invoiceLink: string;
    lineItemsHtml: string;
    summaryAmount: number;
    pdfAttached: boolean;
  }): string {
    const { invoice, invoiceLink, lineItemsHtml, summaryAmount, pdfAttached } = input;
    const paymentProvider =
      invoice.paymentProvider === 'NOTCHPAY'
        ? 'NotchPay'
        : invoice.paymentProvider === 'ZIKOPAY'
          ? 'ZikoPay'
          : 'Paiement mobile';

    return `
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            .pm-break {
              word-break: break-word !important;
              overflow-wrap: anywhere !important;
            }
            @media only screen and (max-width: 640px) {
              .pm-shell {
                padding: 14px 8px !important;
              }
              .pm-card {
                border-radius: 16px !important;
              }
              .pm-pad {
                padding-left: 16px !important;
                padding-right: 16px !important;
              }
              .pm-brand {
                font-size: 22px !important;
              }
              .pm-hero-title {
                font-size: 20px !important;
                line-height: 1.3 !important;
              }
              .pm-total {
                font-size: 18px !important;
              }
              .pm-stack td {
                display: block !important;
                width: 100% !important;
                text-align: left !important;
              }
              .pm-stack td + td {
                padding-top: 8px !important;
              }
              .pm-button {
                display: block !important;
                width: 100% !important;
                box-sizing: border-box !important;
                text-align: center !important;
              }
            }
          </style>
          <title>Recu ${this.escapeHtml(invoice.reference)}</title>
        </head>
        <body style="margin:0;padding:0;background:#edf3ff;font-family:Arial,Helvetica,sans-serif;color:#0f2b61;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="pm-shell" style="background:#edf3ff;padding:24px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="640" cellpadding="0" cellspacing="0" class="pm-card" style="width:100%;max-width:640px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #cfe0ff;box-shadow:0 20px 45px rgba(10,42,107,0.18);">
                  <tr>
                    <td class="pm-pad" style="padding:28px 26px;background:linear-gradient(130deg,#0b3c9f 0%,#1b73ef 100%);">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td class="pm-brand" style="font-size:28px;line-height:1;font-weight:800;color:#ffffff;letter-spacing:0.8px;">BOOST PERFORMERS</td>
                        </tr>
                        <tr>
                          <td style="padding-top:10px;font-size:13px;color:#dce9ff;letter-spacing:0.15em;text-transform:uppercase;">Recu de paiement confirme</td>
                        </tr>
                        <tr>
                          <td class="pm-hero-title pm-break" style="padding-top:12px;font-size:22px;line-height:1.3;font-weight:700;color:#ffffff;">Facture ${this.escapeHtml(invoice.reference)}</td>
                        </tr>
                        <tr>
                          <td style="padding-top:6px;font-size:13px;color:#dce9ff;">Date: ${this.formatDate(new Date())} | Site: www.boost-performers.com</td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td class="pm-pad" style="padding:20px 26px 4px 26px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding:16px;background:#f4f8ff;border:1px solid #d6e4ff;border-radius:14px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="pm-stack">
                              <tr>
                                <td style="font-size:13px;color:#4d6899;">Client</td>
                                <td style="font-size:13px;color:#4d6899;text-align:right;">Statut</td>
                              </tr>
                              <tr>
                                <td class="pm-break" style="padding-top:6px;font-size:17px;font-weight:700;color:#12357f;">${this.escapeHtml(invoice.customerName)}</td>
                                <td style="padding-top:6px;text-align:right;">
                                  <span style="display:inline-block;padding:5px 10px;border-radius:999px;background:#dff4e7;color:#127844;font-size:12px;font-weight:700;">PAID</span>
                                </td>
                              </tr>
                              <tr>
                                <td class="pm-break" style="padding-top:4px;font-size:13px;color:#4d6899;">${this.escapeHtml(invoice.customerEmail)}</td>
                                <td style="padding-top:4px;font-size:13px;color:#4d6899;text-align:right;">${paymentProvider} - ${invoice.currency}</td>
                              </tr>
                              <tr>
                                <td style="padding-top:10px;font-size:13px;color:#4d6899;">Montant recu</td>
                                <td style="padding-top:10px;font-size:22px;font-weight:800;color:#10357f;text-align:right;">${this.formatAmount(invoice.amount)} ${invoice.currency}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td class="pm-pad" style="padding:16px 26px 8px 26px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d6e4ff;border-radius:14px;overflow:hidden;">
                        <thead>
                          <tr style="background:#e9f1ff;">
                            <th align="left" style="padding:10px 12px;font-size:12px;color:#375282;text-transform:uppercase;letter-spacing:0.08em;">Service</th>
                            <th align="center" style="padding:10px 12px;font-size:12px;color:#375282;text-transform:uppercase;letter-spacing:0.08em;">Qte</th>
                            <th align="right" style="padding:10px 12px;font-size:12px;color:#375282;text-transform:uppercase;letter-spacing:0.08em;">PU</th>
                            <th align="right" style="padding:10px 12px;font-size:12px;color:#375282;text-transform:uppercase;letter-spacing:0.08em;">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${lineItemsHtml}
                        </tbody>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td class="pm-pad" style="padding:0 26px 10px 26px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d6e4ff;border-radius:14px;background:#f6f9ff;">
                        <tr>
                          <td style="padding:14px 16px;font-size:13px;color:#4d6899;">Sous-total calcule</td>
                          <td style="padding:14px 16px;font-size:13px;color:#12357f;font-weight:700;text-align:right;">${this.formatAmount(summaryAmount)} ${invoice.currency}</td>
                        </tr>
                        <tr>
                          <td style="padding:4px 16px 14px 16px;font-size:13px;color:#4d6899;">Montant total facture</td>
                          <td class="pm-total" style="padding:4px 16px 14px 16px;font-size:20px;color:#0e3280;font-weight:800;text-align:right;">${this.formatAmount(invoice.amount)} ${invoice.currency}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td class="pm-pad" style="padding:6px 26px 6px 26px;">
                      <p class="pm-break" style="margin:0;font-size:13px;color:#294b84;line-height:1.6;">
                        Bonjour ${this.escapeHtml(invoice.customerName)}, votre paiement est confirme.
                        ${pdfAttached ? 'Le recu PDF est joint a ce mail.' : 'Le recu PDF sera ajoute des que disponible.'}
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td class="pm-pad" style="padding:16px 26px 18px 26px;">
                      <p class="pm-break" style="margin:0 0 10px 0;font-size:12px;color:#4d6899;">
                        Lien officiel de facturation: ${this.escapeHtml(invoiceLink)}
                      </p>
                      <a href="${this.escapeHtml(invoiceLink)}" class="pm-button" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#1154d4;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">
                        Consulter la facture en ligne
                      </a>
                    </td>
                  </tr>

                  <tr>
                    <td class="pm-pad" style="padding:16px 26px 24px 26px;background:#f7faff;border-top:1px solid #dbe8ff;">
                      <p class="pm-break" style="margin:0 0 8px 0;font-size:11px;line-height:1.6;color:#5f7296;">
                        ${this.escapeHtml(LEGAL_MENTIONS)}
                      </p>
                      <p class="pm-break" style="margin:0;font-size:11px;line-height:1.6;color:#5f7296;">
                        Conditions de remboursement: ${this.escapeHtml(RECEIPT_TERMS)}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  private renderText(invoice: Invoice, invoiceLink: string, pdfAttached: boolean): string {
    return [
      `Boost Performers - Recu de paiement`,
      ``,
      `Bonjour ${invoice.customerName},`,
      `Votre paiement pour la facture ${invoice.reference} est confirme.`,
      `Montant: ${this.formatAmount(invoice.amount)} ${invoice.currency}`,
      `Client: ${invoice.customerEmail}`,
      `Date: ${this.formatDate(new Date())}`,
      `PDF: ${pdfAttached ? 'joint' : 'en cours de generation'}`,
      `Voir la facture: ${invoiceLink}`,
      ``,
      `Mentions: ${LEGAL_MENTIONS}`,
      `Conditions: ${RECEIPT_TERMS}`,
    ].join('\n');
  }
}
