'use client';

import { useEffect, useState } from 'react';
import {
  LOCAL_SUBSCRIPTIONS_UPDATED_EVENT,
  readLocalSubscriptions,
} from '@/features/subscriptions/lib/local-storage';

export function GuestLandingHero() {
  const [hasSubscriptions, setHasSubscriptions] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setHasSubscriptions(readLocalSubscriptions().length > 0);
      setIsReady(true);
    };

    sync();
    window.addEventListener(LOCAL_SUBSCRIPTIONS_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(LOCAL_SUBSCRIPTIONS_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!isReady || hasSubscriptions) {
    return null;
  }

  return (
    <section className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="mx-auto max-w-5xl px-4 py-14">
        <p className="text-sm font-semibold text-brand-600">サブスクって、払いたいから払うとるんや。</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 dark:text-white">でも、なんぼ払ろてるかは、たまに確かめたいやろ。</h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-gray-600 dark:text-gray-300">サブスク払ろてるは、登録なしですぐ使えるダッシュボードやで。必要なサブスクも、なんとなく続いとるサブスクも、まとめて把握して、見直しのきっかけ作れるんや。</p>
      </div>
    </section>
  );
}
