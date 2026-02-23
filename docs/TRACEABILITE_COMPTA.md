# Tracabilite Paiements (Comptabilite)

Le projet conserve maintenant un journal de paiements dans la table `payment_transactions`.

## Donnees stockees

- Identifiants: `id`, `invoiceId`, `reference`, `providerTransactionId`
- Statut: `status`, `paidAt`
- Valeurs: `amount`, `currency`, `country`
- Client: `payerName`, `payerEmail`, `payerPhone`
- Technique: `provider`, `checkoutUrl`, `rawInitiation`, `rawWebhook`
- Audit: `metadata.lastInitiatedAt`, `metadata.initiationCount`, `metadata.lastWebhookAt`, `metadata.webhookCount`, `metadata.events`

## API utiles

- `GET /payments/transactions`
  - filtres supportes: `status`, `provider`, `country`, `invoiceId`, `search`, `fromDate`, `toDate`, `page`, `limit`
- `GET /payments/invoices/:id/transactions`
  - renvoie tout l'historique de paiement pour une facture
- `POST /payments/invoices/:id/sync-status`
  - interroge l'API provider (ex: ZikoPay `GET /payment/status/{reference}`) et met a jour le statut local reel
  - body optionnel (rattrapage legacy): `{ "provider": "ZIKOPAY", "providerReference": "TP-...-SUFFIX" }`
- `GET /payments/transactions/export`
  - export CSV pour comptabilite (accepte les memes filtres)

## Dashboard

Le dashboard affiche une section **Transactions recentes** avec les informations client de paiement et un bouton **Exporter CSV**.

## Important (Production)

- Configurez `ZIKOPAY_WEBHOOK_SECRET` pour accepter les webhooks signes.
- Le endpoint `sync-status` sert de rattrapage manuel si un webhook n'arrive pas ou si le statut reste `PENDING`.
