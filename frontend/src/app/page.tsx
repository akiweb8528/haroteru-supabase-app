import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/auth';
import { SignInButton } from '@/components/auth/SignInButton';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { GuestLandingHero } from '@/features/subscriptions/components/GuestLandingHero';
import { SubscriptionDashboard } from '@/features/subscriptions/components/SubscriptionDashboard';

export default async function LandingPage() {
  const user = await getServerUser();
  if (user) {
    redirect('/subscriptions');
  }

  return (
    <div className="min-h-app flex flex-col bg-gray-50 dark:bg-gray-950">
      <nav className="safe-area-pt safe-area-px sticky top-0 z-40 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
            <BrandLogo />
            サブスク払ろてる
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500 sm:flex dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
              ローカル保存
            </div>
            <SignInButton compact />
          </div>
        </div>
      </nav>

      <main className="flex-1">
        <GuestLandingHero />
        <SubscriptionDashboard isGuest />
      </main>

      <SiteFooter />
    </div>
  );
}
