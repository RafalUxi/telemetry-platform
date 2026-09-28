import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'UXI | Telemetry Platform',
  description:
    'Live IoT telemetry dashboard: simulated sensors publish over MQTT into TimescaleDB, served by a NestJS API. Enter as a guest to browse 100M+ measurements.',
  openGraph: {
    title: 'UXI | Telemetry Platform',
    description:
      'End-to-end IoT pipeline built from scratch: MQTT broker with per-device credentials, ingest with a Redis queue, a worker batching into TimescaleDB, and a NestJS API behind JWT auth. The dashboard charts over 100 million measurements collected from simulated devices.',
    url: 'https://panel.rafaltrzeciakowski.dev',
    siteName: 'UXI Telemetry Platform',
    type: 'website',
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
