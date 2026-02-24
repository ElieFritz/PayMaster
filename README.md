# PayMaster - The Performers Billing Dashboard

Stack:
- Frontend: Next.js 14 (App Router), Tailwind CSS, RHF + Zod.
- Backend: NestJS, TypeORM, BullMQ.
- Paiement: Strategy Pattern (`CM -> NotchPay`, `autres -> ZikoPay`).
- Infra cible: Vercel (frontend), Render (backend + Redis), Supabase (PostgreSQL).

## Produit

L application est un dashboard de facturation:
- `/dashboard`: emettre, filtrer, visualiser les factures et statuts.
- `/invoices/new`: creer une facture multi-lignes de services.
- `/p/[invoice_id]`: page publique de paiement.

## Backend: DB et Migrations

Le backend supporte maintenant:
- `DATABASE_URL` (recommande pour Supabase/Render).
- migrations TypeORM (creation table `invoices` + enums + indexes).

Scripts utiles (`backend/package.json`):
- `npm run migration:run`
- `npm run migration:revert`
- `npm run migration:generate`

## Deploiement DB (Supabase) - Etapes precises

### 1. Creer la base Supabase
1. Créez un projet Supabase.
2. Récupérez la connection string PostgreSQL (URI) dans `Project Settings > Database`.
3. Activez `Transaction pooler` si vous comptez scaler beaucoup de connexions applicatives.

### 2. Configurer le backend Render

Dans les variables d environnement Render (service backend):
- `NODE_ENV=production`
- `PORT=4000`
- `DATABASE_URL=<URI_supabase>`
- `DATABASE_SSL=true`
- `TYPEORM_SYNCHRONIZE=false`
- `REDIS_HOST=<host_redis_render>`
- `REDIS_PORT=<port_redis_render>`
- `REDIS_PASSWORD=<password_redis_render>`
- `REDIS_ENABLED=true`
- `NOTCHPAY_API_KEY=...`
- `NOTCHPAY_WEBHOOK_SECRET=...`
- `ZIKOPAY_API_KEY=...`
- `ZIKOPAY_WEBHOOK_SECRET=...`
- `RESEND_API_KEY=...`
- `RESEND_FROM=no-reply@boost-performers.com`
- `AUTH_JWT_SECRET=<secret-long-et-prive>`
- `AUTH_JWT_EXPIRES_IN=12h`
- `AUTH_ADMIN_EMAIL=admin@boost-performers.com`
- `AUTH_ADMIN_PASSWORD=<mot-de-passe-admin>`
- `AUTH_ACCOUNTANT_EMAIL=comptable@boost-performers.com`
- `AUTH_ACCOUNTANT_PASSWORD=<mot-de-passe-comptable>`
- `FRONTEND_URL=https://<votre-frontend>.vercel.app`
- `PUBLIC_BILLING_URL=https://www.boost-performers.com`
- `CORS_ALLOWED_ORIGINS=https://<votre-frontend>.vercel.app,http://localhost:3000`

Notes production:
- Backend public URL actuelle: `https://paymaster-u6z2.onrender.com`
- CORS backend: vous pouvez utiliser `FRONTEND_URL` ou `CORS_ALLOWED_ORIGINS` (supporte une liste separee par virgule et les patterns type `https://*.vercel.app`).
- Cote frontend, utiliser `PAYMASTER_BACKEND_URL=https://paymaster-u6z2.onrender.com`.
- Pour des liens clients credibles, definir `PAYMASTER_PUBLIC_BILLING_URL=https://www.boost-performers.com` (frontend) et `PUBLIC_BILLING_URL=https://www.boost-performers.com` (backend).
- Optionnel frontend: `PAYMASTER_BACKEND_TIMEOUT_MS=12000` pour eviter un ecran vide si le backend est lent.
- Render backend: `Build Command = npm ci && npm run install:browser && npm run build`, `Start Command = npm run start:prod`.
- Verification email recu: endpoint manuel `POST /payments/invoices/:id/send-receipt` (facture `PAID` requise).

### 3. Lancer la migration en production

Depuis un shell Render (ou pipeline CI/CD) dans `backend/`:

```bash
npm ci
npm run build
npm run migration:run
```

Important:
- migration a executer avant de demarrer l app la premiere fois.
- en production, garder `TYPEORM_SYNCHRONIZE=false`.

### 4. Verification DB

Dans Supabase SQL Editor:

```sql
select count(*) from invoices;
```

et:

```sql
select * from invoices order by "createdAt" desc limit 20;
```

## Local dev rapide

Prerequis:
- PostgreSQL sur `localhost:5432`
- Redis sur `localhost:6379` (optionnel si `REDIS_ENABLED=false`)

Puis:

```bash
cd backend
cp .env.example .env
npm install
npm run migration:run
npm run start:dev
```

Comptes de connexion dashboard:
- Admin: peut creer des factures et envoyer manuellement les recus.
- Comptable: acces lecture seule (dashboard + transactions, sans edition).

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

## Pourquoi la DB n etait pas creee automatiquement sur votre machine

Dans votre environnement actuel:
- Docker n etait pas installe.
- aucun PostgreSQL/Redis local n etait actif.

Donc Nest ne pouvait pas se connecter pour initialiser la base (`ECONNREFUSED`).
