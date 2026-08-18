import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: 'DocSaarthi — Multilingual Document Intelligence', template: '%s | DocSaarthi' },
  description:
    'Upload scanned PDFs, images, and Indian documents. Extract structured data, verify with confidence scoring, and chat with your documents in Hindi and English.',
  keywords: ['document OCR', 'Hindi OCR', 'document AI', 'India', 'PDF scanner'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className={`${inter.variable} font-sans bg-surface text-white antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
