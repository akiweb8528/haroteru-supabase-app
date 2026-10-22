import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { SessionProvider } from '@/providers/SessionProvider';
import { PreferencesProvider } from '@/providers/PreferencesProvider';
import { SubscriptionMigrationHandler } from '@/features/subscriptions/components/SubscriptionMigrationHandler';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

function resolveSiteUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    'http://localhost:3000',
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      return new URL(candidate);
    } catch {
      continue;
    }
  }

  return new URL('http://localhost:3000');
}

const siteUrl = resolveSiteUrl();
const googleAnalyticsId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
const analyticsEnvironment = process.env.NEXT_PUBLIC_APP_ENV?.trim();
const themeInitScript = "try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  alternates: {
    canonical: 'https://haroteru.com/',
  },
  title: {
    template: '%s | サブスク払ろてる',
    default: 'サブスク払ろてる',
  },
  description: '登録なしですぐ使える、サブスクの軽量ダッシュボードやで。',
  applicationName: 'サブスク払ろてる',
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: siteUrl.toString(),
    siteName: 'サブスク払ろてる',
    title: 'サブスク払ろてる',
    description: '登録なしですぐ使える、サブスクの軽量ダッシュボードやで。',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'サブスク払ろてる',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'サブスク払ろてる',
    description: '登録なしですぐ使える、サブスクの軽量ダッシュボードやで。',
    images: ['/icon.png'],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9fafb' },
    { media: '(prefers-color-scheme: dark)', color: '#030712' },
  ],
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full" suppressHydrationWarning>
      <head>
        <Script src="/api/runtime-config" strategy="beforeInteractive" />
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        {googleAnalyticsId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${googleAnalyticsId}', ${JSON.stringify(
                  analyticsEnvironment ? { environment: analyticsEnvironment } : {}
                )});
              `}
            </Script>
          </>
        )}
      </head>
      <body className={`${inter.className} h-full bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100`}>
        <SessionProvider>
          <PreferencesProvider>
            <SubscriptionMigrationHandler />
            {children}
          </PreferencesProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
