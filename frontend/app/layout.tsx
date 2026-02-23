import type { Metadata } from 'next';
import { Cormorant_Garamond, Manrope } from 'next/font/google';

import './globals.css';

const displayFont = Cormorant_Garamond({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

const bodyFont = Manrope({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'The Performers Billing',
  description: 'SaaS de facturation premium pour The Performers',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className={`${displayFont.variable} ${bodyFont.variable} antialiased`}>
        <div className="relative min-h-screen">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,214,122,0.05),transparent)]" />
          <div className="relative z-10">{children}</div>
        </div>
      </body>
    </html>
  );
}
