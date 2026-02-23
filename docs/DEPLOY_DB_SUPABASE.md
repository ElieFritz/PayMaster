# Deploy Database (Supabase) - PayMaster

## 1) Create Supabase project
1. Create a new Supabase project.
2. Open `Project Settings > Database`.
3. Copy `Connection string` (URI format).

## 2) Configure backend env on Render

Set these vars on your Render backend service:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
DATABASE_SSL=true
TYPEORM_SYNCHRONIZE=false
```

Important:
- Keep `TYPEORM_SYNCHRONIZE=false` in all environments using Supabase.
- Schema updates must be applied via migrations only.

Also set Redis vars:

```env
REDIS_HOST=...
REDIS_PORT=...
REDIS_PASSWORD=...
REDIS_ENABLED=true
```

Payment vars (required for real checkout):

```env
PAYMENT_PROVIDER_MOCK=false
NOTCHPAY_API_KEY=...
ZIKOPAY_API_KEY=...
ZIKOPAY_API_SECRET=...
ZIKOPAY_FORCE_CURRENCY=
ZIKOPAY_AUTO_FALLBACK_CURRENCY=false
ZIKOPAY_DEFAULT_OPERATOR=
ZIKOPAY_DEFAULT_PHONE=...
```

Note ZikoPay:
- Integration uses `POST /payments/payin/mobile-money`.
- Operator is selected from invoice metadata (`metadata.customerOperator`) according to country.
- Wallet currencies are checked through `GET /wallet` to prevent `Currency not supported` failures.

## 3) Run schema migration

From Render Shell (backend root):

```bash
npm ci
npm run build
npm run migration:run
```

This creates:
- `invoices` table
- `payment_transactions` table
- enums (`currency`, `status`, `paymentProvider`)
- indexes (`reference`, `status`, `country`, `createdAt`)
- traceability/accounting indexes on payment transactions

Migration file:
- `backend/src/database/migrations/1700000000000-CreateInvoicesTable.ts`
- `backend/src/database/migrations/1700000001000-CreatePaymentTransactionsTable.ts`

## 4) Validate schema

In Supabase SQL editor:

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'invoices'
order by ordinal_position;
```

```sql
select count(*) from invoices;
```

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'payment_transactions'
order by ordinal_position;
```

## 5) Webhook readiness

After backend is live, configure providers:
- `POST https://<backend-domain>/webhooks/NOTCHPAY`
- `POST https://<backend-domain>/webhooks/ZIKOPAY`

## Local start note

If you do not have Redis locally, keep:

```env
REDIS_ENABLED=false
```

The API starts, but BullMQ workers/webhook queueing are disabled until Redis is enabled.
