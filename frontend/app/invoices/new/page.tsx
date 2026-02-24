import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { InvoiceForm } from '@/components/invoice/invoice-form';
import { ACCESS_TOKEN_COOKIE, USER_ROLE_COOKIE } from '@/lib/auth';

export default function NewInvoicePage() {
  const cookieStore = cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const role = cookieStore.get(USER_ROLE_COOKIE)?.value;

  if (!accessToken) {
    redirect('/login');
  }

  if (role !== 'ADMIN') {
    redirect('/dashboard?forbidden=1');
  }

  return (
    <main className="container py-14">
      <InvoiceForm />
    </main>
  );
}
