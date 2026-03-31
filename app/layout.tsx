import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Manrope } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import 'animate.css';
import 'katex/dist/katex.min.css';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { I18nProvider } from '@/lib/hooks/use-i18n';
import { Toaster } from '@/components/ui/sonner';
import { ServerProvidersInit } from '@/components/server-providers-init';
import { HtmlDirectionManager } from '@/components/html-direction-manager';
import { OfflineIndicator } from '@/components/offline-indicator';
import { PwaInstallBanner } from '@/components/pwa-install-banner';
import { TelemetryConsentBanner } from '@/components/telemetry-consent-banner';
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar';
import { SidebarLayout } from '@/components/sidebar-layout';
import { ErrorBoundary } from '@/components/error-boundary';

const inter = localFont({
  src: '../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-sans',
  weight: '100 900',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Qalem',
  description:
    'The open-source AI interactive classroom. Upload a PDF to instantly generate an immersive, multi-agent learning experience.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="" className={`${inter.variable} ${manrope.variable}`} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#722ed1" />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ErrorBoundary>
          <ThemeProvider>
            <I18nProvider>
              <HtmlDirectionManager />
              <ServerProvidersInit />
              <OfflineIndicator />
              <PwaInstallBanner />
              <TelemetryConsentBanner />
              <ServiceWorkerRegistrar />
              <SidebarLayout>{children}</SidebarLayout>
              <Toaster position="top-center" />
            </I18nProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
