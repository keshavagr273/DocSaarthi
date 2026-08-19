import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Playfair_Display } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

const serif = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
  style: ['normal', 'italic'],
  weight: ['400', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'DocSaarthi — Multilingual Document Intelligence', template: '%s | DocSaarthi' },
  description:
    'Upload scanned PDFs, images, and Indian documents. Extract structured data, verify with confidence scoring, and chat with your documents in Hindi and English.',
  keywords: ['document OCR', 'Hindi OCR', 'document AI', 'India', 'PDF scanner'],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/logo.png', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body className={`${sans.variable} ${serif.variable} font-sans bg-[#050508] text-white antialiased selection:bg-brand-500/30 selection:text-white`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
