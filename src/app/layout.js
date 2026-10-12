import { Geist, Geist_Mono } from 'next/font/google';
import { THEME_BOOT_SCRIPT } from '@/lib/theme-script';
import { getAppConfig } from '@/lib/app-config';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateMetadata() {
  const config = await getAppConfig();
  return {
    title: { default: config.brand.name, template: `%s · ${config.brand.name}` },
    description: 'Binance futures portfolio and risk dashboard',
    icons: { icon: '/icon.png' },
  };
}

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0d10' },
    { media: '(prefers-color-scheme: light)', color: '#f5f6f8' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
