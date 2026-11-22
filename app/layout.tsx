import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Eminent Hospice Care | Office Flow',
  description: 'Eminent Hospice Care의 어드미션, 서명, 팔로업, 청구와 수납을 연결하는 사무실 관리 워크스페이스.',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
