import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DORO — 전국 실시간 교통량',
  description:
    '한국도로공사 공공데이터와 OpenStreetMap으로 보는 전국 고속도로 실시간 소통 현황',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-slate-950">{children}</body>
    </html>
  );
}
