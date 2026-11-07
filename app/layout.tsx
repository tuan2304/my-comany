import type { Metadata, Viewport } from 'next';
import PwaRegister from '@/components/PwaRegister';
import { THEME_BOOT_SCRIPT } from '@/lib/theme-boot';
import './globals.css';

export const metadata: Metadata = {
  title: 'My Company',
  description: 'Công ty ảo chạy bằng Claude Code',
  appleWebApp: { capable: true, title: 'My Company', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0b16',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
