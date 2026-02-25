'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';

import { PaymentProviderBadge } from '@/components/payment/payment-provider-badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { COUNTRIES, resolveCurrency } from '@/lib/countries';
import { getDefaultOperator, getOperatorsByCountry } from '@/lib/mobile-money-operators';
import { resolvePublicOrigin } from '@/lib/public-origin';
import { invoiceFormSchema, InvoiceFormValues } from '@/lib/schemas';

const DEFAULT_LINE = {
  category: 'BOOST' as const,
  name: '',
  description: '',
  quantity: 1,
  unitPrice: 0,
};

export function InvoiceForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);
  const [createdInvoiceReference, setCreatedInvoiceReference] = useState<string | null>(null);
  const [createdCustomerEmail, setCreatedCustomerEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      country: 'CM',
      currency: 'XAF',
      customerName: '',
      customerEmail: '',
      lines: [DEFAULT_LINE],
      metadata: {
        projectName: '',
        notes: '',
        customerPhone: '',
        customerOperator: '',
      },
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });

  const country = watch('country');
  const currency = watch('currency');
  const operatorOptions = getOperatorsByCountry(country);
  const selectedOperator = watch('metadata.customerOperator');

  useEffect(() => {
    setValue('currency', resolveCurrency(country), { shouldValidate: true });
  }, [country, setValue]);

  useEffect(() => {
    if (country === 'CM') {
      setValue('metadata.customerOperator', '', { shouldValidate: true });
      return;
    }

    if (operatorOptions.length === 0) {
      return;
    }

    const hasSelection = operatorOptions.some((operator) => operator.value === selectedOperator);

    if (!hasSelection) {
      setValue('metadata.customerOperator', getDefaultOperator(country), { shouldValidate: true });
    }
  }, [country, operatorOptions, selectedOperator, setValue]);

  const publicBillingOrigin = resolvePublicBillingOrigin();
  const publicInvoiceSlug = createdInvoiceReference || createdInvoiceId;
  const publicPaymentUrl =
    publicInvoiceSlug && publicBillingOrigin
      ? `${publicBillingOrigin}/p/${encodeURIComponent(publicInvoiceSlug)}`
      : null;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setCopied(false);

    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const payload = await response.json();

      if (!response.ok) {
        const message = Array.isArray(payload?.message)
          ? payload.message.join(', ')
          : payload?.message || 'Erreur lors de la creation de facture.';
        throw new Error(message);
      }

      setCreatedInvoiceId(payload.id);
      setCreatedInvoiceReference(payload.reference || null);
      setCreatedCustomerEmail(payload.customerEmail || values.customerEmail);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue.';
      setServerError(message);
    }
  });

  async function copyPaymentLink() {
    if (!publicPaymentUrl) {
      return;
    }

    await navigator.clipboard.writeText(publicPaymentUrl);
    setCopied(true);
  }

  function resetCreationFlow() {
    setCreatedInvoiceId(null);
    setCreatedInvoiceReference(null);
    setCreatedCustomerEmail(null);
    setCopied(false);
    setServerError(null);
    reset({
      country: 'CM',
      currency: 'XAF',
      customerName: '',
      customerEmail: '',
      lines: [DEFAULT_LINE],
      metadata: {
        projectName: '',
        notes: '',
        customerPhone: '',
        customerOperator: '',
      },
    });
  }

  if (createdInvoiceId && publicPaymentUrl) {
    const emailSubject = encodeURIComponent(
      `Facture The Performers${createdInvoiceReference ? ` - ${createdInvoiceReference}` : ''}`,
    );
    const emailBody = encodeURIComponent(
      `Bonjour,\n\nVeuillez proceder au paiement de votre facture via ce lien securise:\n${publicPaymentUrl}\n\nEquipe The Performers`,
    );
    const mailtoLink = `mailto:${createdCustomerEmail || ''}?subject=${emailSubject}&body=${emailBody}`;
    const whatsappLink = `https://wa.me/?text=${encodeURIComponent(
      `Bonjour, voici votre lien de paiement The Performers: ${publicPaymentUrl}`,
    )}`;

    return (
      <Card className="mx-auto max-w-3xl animate-shimmerIn space-y-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.22em] text-[#e1bf64]">Facture creee</p>
          <CardTitle className="text-4xl">Lien client genere</CardTitle>
          <CardDescription>
            La facture {createdInvoiceReference || createdInvoiceId} est prete. Partage ce lien au client
            pour qu il puisse payer.
          </CardDescription>
        </div>

        <div className="rounded-lg border border-[#1457d5]/30 bg-[#0e2f78]/20 p-3 text-xs text-[#cfe0ff]">
          Lien officiel de paiement: <strong>{publicBillingOrigin}</strong> (HTTPS, identite Boost
          Performers).
        </div>

        <div className="space-y-2 rounded-lg border border-[#8e7640]/30 bg-[#15120b]/70 p-4">
          <Label htmlFor="paymentLink">Lien de paiement</Label>
          <Input id="paymentLink" readOnly value={publicPaymentUrl} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button onClick={copyPaymentLink}>{copied ? 'Lien copie' : 'Copier le lien'}</Button>
          <Button variant="outline" onClick={() => window.open(publicPaymentUrl, '_blank')}>
            Ouvrir la page client
          </Button>
          <Button variant="outline" onClick={() => window.open(mailtoLink, '_self')}>
            Envoyer par email
          </Button>
          <Button variant="outline" onClick={() => window.open(whatsappLink, '_blank')}>
            Partager WhatsApp
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={resetCreationFlow}>
            Creer une autre facture
          </Button>
          <Link href="/dashboard" className="inline-flex text-sm text-[#ddc178] hover:text-[#f1d888]">
            Retour au dashboard
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-5xl animate-shimmerIn space-y-8">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-[#e1bf64]">The Performers Billing</p>
        <CardTitle className="text-4xl">Creer une facture premium</CardTitle>
        <CardDescription>
          Configurez la facture, les services et la passerelle de paiement adaptee a la geographie client.
        </CardDescription>
        <Link href="/dashboard" className="inline-flex text-sm text-[#ddc178] hover:text-[#f1d888]">
          Retour au dashboard
        </Link>
      </div>

      <form className="space-y-8" onSubmit={onSubmit}>
        <section className="grid gap-5 md:grid-cols-3">
          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="country">Pays du client</Label>
            <Select id="country" {...register('country')}>
              {COUNTRIES.map((countryItem) => (
                <option key={countryItem.code} value={countryItem.code}>
                  {countryItem.label}
                </option>
              ))}
            </Select>
            {errors.country?.message && (
              <p className="text-xs text-rose-300">{errors.country.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerName">Nom du client</Label>
            <Input id="customerName" placeholder="Nom ou entreprise" {...register('customerName')} />
            {errors.customerName?.message && (
              <p className="text-xs text-rose-300">{errors.customerName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerEmail">Email du client</Label>
            <Input
              id="customerEmail"
              type="email"
              placeholder="client@email.com"
              {...register('customerEmail')}
            />
            {errors.customerEmail?.message && (
              <p className="text-xs text-rose-300">{errors.customerEmail.message}</p>
            )}
          </div>
        </section>

        <PaymentProviderBadge country={country} />

        <section className="rounded-xl border border-[#8e7640]/35 bg-black/20 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl">Lignes de services</h3>
            <Button
              type="button"
              variant="outline"
              onClick={() => append(DEFAULT_LINE)}
              className="gap-2"
            >
              <Plus size={16} /> Ajouter une ligne
            </Button>
          </div>

          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border border-white/10 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#d3b56a]">Service #{index + 1}</p>
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" onClick={() => remove(index)}>
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select {...register(`lines.${index}.category`)}>
                      <option value="BOOST">Boost</option>
                      <option value="WEB">Web</option>
                      <option value="ADS">Ads</option>
                      <option value="OTHER">Autre</option>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Nom du service</Label>
                    <Input {...register(`lines.${index}.name`)} placeholder="Landing page, campagne ads..." />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Description</Label>
                    <Input {...register(`lines.${index}.description`)} placeholder="Details supplementaires" />
                  </div>

                  <div className="space-y-2">
                    <Label>Quantite</Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Prix unitaire ({currency})</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      {...register(`lines.${index}.unitPrice`, { valueAsNumber: true })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="projectName">Nom du projet</Label>
            <Input id="projectName" {...register('metadata.projectName')} placeholder="Campagne Q2" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes internes</Label>
            <Textarea id="notes" {...register('metadata.notes')} placeholder="Contexte client, priorites..." />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerPhone">Telephone client (paiement)</Label>
            <Input
              id="customerPhone"
              placeholder="+2376..."
              {...register('metadata.customerPhone')}
            />
            {errors.metadata?.customerPhone?.message && (
              <p className="text-xs text-rose-300">{errors.metadata.customerPhone.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerOperator">Operateur mobile money</Label>
            {country === 'CM' ? (
              <Select id="customerOperator" {...register('metadata.customerOperator')} disabled>
                <option value="">Non requis pour Cameroun (NotchPay)</option>
              </Select>
            ) : operatorOptions.length > 0 ? (
              <Select id="customerOperator" {...register('metadata.customerOperator')}>
                <option value="">Choisir un operateur</option>
                {operatorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id="customerOperator"
                placeholder="Code operateur ZikoPay (ex: airtel_xx)"
                {...register('metadata.customerOperator')}
              />
            )}
            {country !== 'CM' && operatorOptions.length === 0 && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Aucun operateur preconfigure pour ce pays. Renseigne le code operateur valide ZikoPay.
              </p>
            )}
            {errors.metadata?.customerOperator?.message && (
              <p className="text-xs text-rose-300">{errors.metadata.customerOperator.message}</p>
            )}
          </div>
        </section>

        <div className="rounded-lg border border-[#8e7640]/30 bg-[#15120b]/70 p-4 text-sm">
          Devise appliquee automatiquement selon le pays: <strong>{currency}</strong>
        </div>

        {serverError && <p className="text-sm text-rose-300">{serverError}</p>}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
            Validation client + serveur active
          </p>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creation en cours...' : 'Generer la facture'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function resolvePublicBillingOrigin(): string | null {
  if (typeof window === 'undefined') {
    return resolvePublicOrigin([process.env.NEXT_PUBLIC_APP_URL]);
  }

  return resolvePublicOrigin([process.env.NEXT_PUBLIC_APP_URL, window.location.origin]);
}
