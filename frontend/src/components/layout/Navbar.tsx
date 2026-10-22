'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { usePreferences } from '@/providers/PreferencesProvider';

interface Props {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export function Navbar({ user }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { useGoogleAvatar, resetPreferences } = usePreferences();

  function handleSignOut() {
    resetPreferences();
    const supabase = createClient();
    void supabase.auth.signOut().then(() => {
      router.push('/');
      router.refresh();
    });
  }

  const navItems = [
    { href: '/subscriptions', label: 'ダッシュボード', mobileOnly: true },
    { href: '/settings', label: '設定' },
  ];

  const showGoogleAvatar = useGoogleAvatar && !!user.image;

  return (
    <nav className="safe-area-pt safe-area-px sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/subscriptions" className="flex items-center gap-2 font-bold text-gray-900 dark:text-gray-100">
          <BrandLogo />
          サブスク払ろてる
        </Link>

        <div className="hidden items-center gap-3 sm:flex">
          <div className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            クラウド同期中
          </div>

          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition',
                pathname === item.href
                  ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-xl p-1.5 transition hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {showGoogleAvatar ? (
              <Image
                src={user.image!}
                alt={user.name ?? 'User'}
                width={32}
                height={32}
                className="rounded-full"
              />
            ) : useGoogleAvatar ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                {user.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600">
                <svg className="h-5 w-5 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                </svg>
              </div>
            )}
            <svg className="h-4 w-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-gray-100 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <div className="border-b border-gray-100 px-4 py-2 dark:border-gray-700">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{user.name}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
                </div>
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn('block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700', item.mobileOnly && 'sm:hidden')}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                <button
                  onClick={handleSignOut}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  サインアウト
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
