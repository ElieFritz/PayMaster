'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type LoginPayload = {
  user?: {
    email: string;
    role: string;
  };
  message?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nextPath, setNextPath] = useState('/dashboard');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('next');
    setNextPath(normalizeNextPath(value));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as LoginPayload;

      if (!response.ok) {
        throw new Error(data.message || 'Email ou mot de passe invalide.');
      }

      router.replace(nextPath);
      router.refresh();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Connexion impossible.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container py-14">
      <Card className="mx-auto max-w-md space-y-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.22em] text-[#e1bf64]">PayMaster Access</p>
          <CardTitle className="text-3xl">Connexion securisee</CardTitle>
          <CardDescription>
            Connectez-vous avec un compte admin ou comptable pour acceder au dashboard.
          </CardDescription>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@boost-performers.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              required
            />
          </div>

          {error && <p className="text-sm text-rose-300">{error}</p>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Connexion...' : 'Se connecter'}
          </Button>
        </form>
      </Card>
    </main>
  );
}

function normalizeNextPath(value: string | null): string {
  if (!value) {
    return '/dashboard';
  }

  if (!value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }

  return value;
}
