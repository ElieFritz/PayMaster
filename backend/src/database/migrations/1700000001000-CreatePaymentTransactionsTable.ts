import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentTransactionsTable1700000001000 implements MigrationInterface {
  name = 'CreatePaymentTransactionsTable1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_transactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "invoiceId" uuid NOT NULL,
        "provider" "public"."invoices_paymentprovider_enum" NOT NULL,
        "reference" character varying(50) NOT NULL,
        "providerTransactionId" character varying(120),
        "status" "public"."invoices_status_enum" NOT NULL DEFAULT 'PENDING',
        "amount" numeric(14,2) NOT NULL,
        "currency" "public"."invoices_currency_enum" NOT NULL,
        "country" character varying(2) NOT NULL,
        "checkoutUrl" character varying(255),
        "payerName" character varying(120),
        "payerEmail" character varying(120),
        "payerPhone" character varying(25),
        "rawInitiation" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "rawWebhook" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "paidAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payment_transactions_invoice_id" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_transactions_invoice_id" ON "payment_transactions" ("invoiceId");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_transactions_status" ON "payment_transactions" ("status");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_transactions_provider" ON "payment_transactions" ("provider");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_transactions_created_at" ON "payment_transactions" ("createdAt");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_transactions_reference" ON "payment_transactions" ("reference");
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payment_transactions_invoice_provider_reference"
      ON "payment_transactions" ("invoiceId", "provider", "reference");
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payment_transactions_provider_transaction_id"
      ON "payment_transactions" ("providerTransactionId")
      WHERE "providerTransactionId" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_transactions_provider_transaction_id"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payment_transactions_invoice_provider_reference"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_transactions_reference"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_transactions_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_transactions_provider"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_transactions_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_transactions_invoice_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_transactions"`);
  }
}

