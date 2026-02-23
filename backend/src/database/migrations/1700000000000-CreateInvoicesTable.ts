import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInvoicesTable1700000000000 implements MigrationInterface {
  name = 'CreateInvoicesTable1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoices_currency_enum') THEN
          CREATE TYPE "public"."invoices_currency_enum" AS ENUM('XAF', 'XOF');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoices_status_enum') THEN
          CREATE TYPE "public"."invoices_status_enum" AS ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoices_paymentprovider_enum') THEN
          CREATE TYPE "public"."invoices_paymentprovider_enum" AS ENUM('NOTCHPAY', 'ZIKOPAY');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invoices" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "reference" character varying(50) NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "currency" "public"."invoices_currency_enum" NOT NULL,
        "status" "public"."invoices_status_enum" NOT NULL DEFAULT 'PENDING',
        "country" character varying(2) NOT NULL,
        "customerName" character varying(120) NOT NULL,
        "customerEmail" character varying(120) NOT NULL,
        "paymentProvider" "public"."invoices_paymentprovider_enum",
        "paymentUrl" character varying(255),
        "transactionId" character varying(100),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoices_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_invoices_reference" ON "invoices" ("reference");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_invoices_status" ON "invoices" ("status");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_invoices_country" ON "invoices" ("country");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_invoices_createdAt" ON "invoices" ("createdAt");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invoices_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invoices_country"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invoices_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invoices_reference"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invoices"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."invoices_paymentprovider_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."invoices_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."invoices_currency_enum"`);
  }
}

