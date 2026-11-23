import type { Metadata } from 'next';
import './globals.css';
import LocaleProvider from '@/components/locale-provider';

export const metadata: Metadata = {
  title: 'Eminent Hospice Care | Office Flow',
  description: 'Eminent Hospice Care Office Flow — admissions, signatures, follow-ups, billing, and payments. Available in English and Korean.',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><LocaleProvider>{children}</LocaleProvider></body></html>;
}
