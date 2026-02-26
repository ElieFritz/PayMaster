import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import PDFDocument = require('pdfkit');

import { LEGAL_MENTIONS, RECEIPT_TERMS } from '../common/constants/legal';
import { Invoice } from './invoice.entity';

type InvoiceLine = {
  category?: string;
  name?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
};

type NormalizedInvoiceLine = {
  category: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  async generateInvoicePdf(invoice: Invoice): Promise<Buffer> {
    try {
      return await this.renderPdf(invoice);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to generate invoice PDF for ${invoice.reference}: ${message}`);
      throw new ServiceUnavailableException('Invoice PDF generation is temporarily unavailable.');
    }
  }

  private renderPdf(invoice: Invoice): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 36,
          left: 36,
          right: 36,
          bottom: 36,
        },
        info: {
          Title: `Invoice ${invoice.reference}`,
          Author: 'Boost Performers',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.renderDocument(doc, invoice);
      doc.end();
    });
  }

  private renderDocument(doc: PDFKit.PDFDocument, invoice: Invoice): void {
    const lines = this.resolveInvoiceLines(invoice);
    const projectName = this.resolveOptionalString((invoice.metadata || {}).projectName) || 'Digital services';
    const notes = this.resolveOptionalString((invoice.metadata || {}).notes);
    const invoiceDate = this.formatDate(invoice.createdAt);
    const subtotal = lines.length > 0
      ? lines.reduce((sum, line) => sum + line.total, 0)
      : Number(invoice.amount);

    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;
    const top = doc.page.margins.top;

    doc.fillColor('#0f2e6d').font('Helvetica-Bold').fontSize(24).text('THE PERFORMERS', left, top);
    doc.fillColor('#4d6899').font('Helvetica').fontSize(10).text('Agence digitale et publicitaire', left, top + 30);
    doc.text('billing@boost-performers.com', left, top + 44);

    const headerRightWidth = 230;
    const headerRightX = left + pageWidth - headerRightWidth;
    doc.fillColor('#0f2e6d').font('Helvetica-Bold').fontSize(18).text('INVOICE', headerRightX, top, {
      width: headerRightWidth,
      align: 'right',
    });
    doc.fillColor('#4d6899').font('Helvetica').fontSize(10).text(`Reference: ${invoice.reference}`, headerRightX, top + 30, {
      width: headerRightWidth,
      align: 'right',
    });
    doc.text(`Issued: ${invoiceDate}`, headerRightX, top + 44, {
      width: headerRightWidth,
      align: 'right',
    });
    doc.text(`Status: ${invoice.status}`, headerRightX, top + 58, {
      width: headerRightWidth,
      align: 'right',
    });

    doc.y = top + 82;
    const customerBoxY = doc.y;
    doc.roundedRect(left, customerBoxY, pageWidth, 86, 8).lineWidth(1).strokeColor('#d7e5ff').stroke();
    doc.fillColor('#12357f').font('Helvetica-Bold').fontSize(11).text('Billing to', left + 12, customerBoxY + 10);
    doc.fillColor('#304f80').font('Helvetica').fontSize(10).text(this.normalizeText(invoice.customerName), left + 12, customerBoxY + 26);
    doc.text(this.normalizeText(invoice.customerEmail), left + 12, customerBoxY + 40);
    doc.text(`Country: ${this.normalizeText(invoice.country)}`, left + 12, customerBoxY + 54);

    const metaRightWidth = 250;
    const metaRightX = left + pageWidth - metaRightWidth - 12;
    doc.fillColor('#12357f').font('Helvetica-Bold').fontSize(10).text('Project', metaRightX, customerBoxY + 10, {
      width: metaRightWidth,
      align: 'right',
    });
    doc.fillColor('#304f80').font('Helvetica').fontSize(10).text(this.normalizeText(projectName), metaRightX, customerBoxY + 26, {
      width: metaRightWidth,
      align: 'right',
    });
    doc.text(`Currency: ${invoice.currency}`, metaRightX, customerBoxY + 40, {
      width: metaRightWidth,
      align: 'right',
    });
    doc.text(`Amount: ${formatAmount(invoice.amount)} ${invoice.currency}`, metaRightX, customerBoxY + 54, {
      width: metaRightWidth,
      align: 'right',
    });

    doc.y = customerBoxY + 102;
    doc.fillColor('#12357f').font('Helvetica-Bold').fontSize(12).text('Service lines');
    doc.moveDown(0.4);

    if (lines.length === 0) {
      this.ensureSpace(doc, 64);
      const emptyY = doc.y;
      doc.roundedRect(left, emptyY, pageWidth, 50, 8).lineWidth(1).strokeColor('#d7e5ff').stroke();
      doc.fillColor('#4d6899').font('Helvetica').fontSize(10).text('No line items defined. Invoice uses global amount.', left + 12, emptyY + 18, {
        width: pageWidth - 24,
      });
      doc.y = emptyY + 62;
    } else {
      lines.forEach((line, index) => {
        const rowHeight = this.computeLineBlockHeight(doc, line, pageWidth - 24);
        this.ensureSpace(doc, rowHeight + 12);
        const blockY = doc.y;

        doc.roundedRect(left, blockY, pageWidth, rowHeight, 8).lineWidth(1).strokeColor('#d7e5ff').stroke();

        let cursorY = blockY + 10;
        doc.fillColor('#12357f').font('Helvetica-Bold').fontSize(10).text(
          `${index + 1}. [${line.category}] ${line.name}`,
          left + 12,
          cursorY,
          { width: pageWidth - 24 },
        );
        cursorY = doc.y + 2;

        doc.fillColor('#4d6899').font('Helvetica').fontSize(9).text(line.description, left + 12, cursorY, {
          width: pageWidth - 24,
        });
        cursorY = doc.y + 4;

        doc.fillColor('#12357f').font('Helvetica-Bold').fontSize(9).text(
          `Qty: ${line.quantity}  |  Unit: ${formatAmount(line.unitPrice)} ${invoice.currency}  |  Total: ${formatAmount(line.total)} ${invoice.currency}`,
          left + 12,
          cursorY,
          { width: pageWidth - 24 },
        );

        doc.y = blockY + rowHeight + 10;
      });
    }

    this.ensureSpace(doc, 150);
    const summaryWidth = 260;
    const summaryX = left + pageWidth - summaryWidth;
    const summaryY = doc.y + 4;
    doc.roundedRect(summaryX, summaryY, summaryWidth, 96, 8).lineWidth(1).strokeColor('#cddfff').stroke();
    doc.fillColor('#12357f').font('Helvetica-Bold').fontSize(11).text('Summary', summaryX + 12, summaryY + 10);
    doc.fillColor('#3f5f95').font('Helvetica').fontSize(10).text(`Subtotal: ${formatAmount(subtotal)} ${invoice.currency}`, summaryX + 12, summaryY + 30);
    doc.text(`VAT: 0 ${invoice.currency}`, summaryX + 12, summaryY + 46);
    doc.fillColor('#103985').font('Helvetica-Bold').fontSize(11).text(
      `Total due: ${formatAmount(invoice.amount)} ${invoice.currency}`,
      summaryX + 12,
      summaryY + 66,
    );
    doc.y = summaryY + 112;

    if (notes) {
      this.ensureSpace(doc, 70);
      const notesY = doc.y;
      doc.roundedRect(left, notesY, pageWidth, 52, 8).lineWidth(1).strokeColor('#d7e5ff').stroke();
      doc.fillColor('#12357f').font('Helvetica-Bold').fontSize(10).text('Client note', left + 12, notesY + 10);
      doc.fillColor('#4d6899').font('Helvetica').fontSize(9).text(this.normalizeText(notes), left + 12, notesY + 26, {
        width: pageWidth - 24,
      });
      doc.y = notesY + 64;
    }

    this.ensureSpace(doc, 120);
    doc.fillColor('#546b93').font('Helvetica').fontSize(8).text(`Legal: ${this.normalizeText(LEGAL_MENTIONS)}`, left, doc.y, {
      width: pageWidth,
    });
    doc.moveDown(0.5);
    doc.text(`Refund terms: ${this.normalizeText(RECEIPT_TERMS)}`, left, doc.y, {
      width: pageWidth,
    });
  }

  private computeLineBlockHeight(
    doc: PDFKit.PDFDocument,
    line: NormalizedInvoiceLine,
    width: number,
  ): number {
    doc.font('Helvetica-Bold').fontSize(10);
    const titleHeight = doc.heightOfString(`[${line.category}] ${line.name}`, { width });

    doc.font('Helvetica').fontSize(9);
    const descriptionHeight = doc.heightOfString(line.description, { width });

    doc.font('Helvetica-Bold').fontSize(9);
    const detailsHeight = doc.heightOfString(
      `Qty: ${line.quantity} | Unit: ${formatAmount(line.unitPrice)} | Total: ${formatAmount(line.total)}`,
      { width },
    );

    return Math.max(64, Math.ceil(18 + titleHeight + 4 + descriptionHeight + 4 + detailsHeight + 10));
  }

  private ensureSpace(doc: PDFKit.PDFDocument, neededHeight: number): void {
    const usableBottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + neededHeight <= usableBottom) {
      return;
    }

    doc.addPage();
    doc.y = doc.page.margins.top;
  }

  private resolveInvoiceLines(invoice: Invoice): NormalizedInvoiceLine[] {
    const rawLines = Array.isArray(invoice.metadata?.services)
      ? (invoice.metadata.services as InvoiceLine[])
      : [];

    return rawLines.map((line, index) => {
      const quantity = this.toPositiveNumber(line.quantity, 1);
      const unitPrice = this.toPositiveNumber(line.unitPrice, 0);

      return {
        category: this.normalizeText(this.resolveOptionalString(line.category) || 'OTHER'),
        name: this.normalizeText(this.resolveOptionalString(line.name) || `Service ${index + 1}`),
        description: this.normalizeText(this.resolveOptionalString(line.description) || '-'),
        quantity,
        unitPrice,
        total: quantity * unitPrice,
      };
    });
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

  private normalizeText(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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
}

function formatAmount(value: number): string {
  return Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
