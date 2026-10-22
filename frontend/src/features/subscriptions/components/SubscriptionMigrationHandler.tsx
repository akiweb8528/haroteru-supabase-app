'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSession } from '@/providers/SessionProvider';
import { mutate } from 'swr';
import type { TrackedSubscription } from '@/types';
import { subscriptionApi } from '@/features/subscriptions/api/subscription-client';
import {
  clearLocalSubscriptions,
  LOCAL_SUBSCRIPTIONS_MIGRATION_REQUESTED_EVENT,
  readLocalSubscriptions,
  writeLocalSubscriptions,
} from '@/features/subscriptions/lib/local-storage';

export function SubscriptionMigrationHandler() {
  const { status } = useSession();
  const attemptedInitialMigration = useRef(false);
  const isMigrating = useRef(false);

  const migrateLocalSubscriptions = useCallback(async () => {
    if (status !== 'authenticated' || isMigrating.current) return;

    const subscriptions: TrackedSubscription[] = readLocalSubscriptions();
    if (!subscriptions.length) {
      clearLocalSubscriptions();
      return;
    }

    isMigrating.current = true;
    try {
      const sorted = [...subscriptions].sort((a, b) => a.position - b.position);
      const failedItems: TrackedSubscription[] = [];

      for (const item of sorted) {
        try {
          await subscriptionApi.create({
            name: item.name,
            amountYen: item.amountYen,
            billingCycle: item.billingCycle,
            category: item.category,
            reviewPriority: item.reviewPriority,
            locked: item.locked,
            billingDay: item.billingDay,
            note: item.note,
          });
        } catch {
          failedItems.push(item);
        }
      }

      if (failedItems.length === 0) {
        clearLocalSubscriptions();
      } else {
        writeLocalSubscriptions(failedItems);
      }

      if (failedItems.length !== sorted.length) {
        await mutate((key) => Array.isArray(key) && key[0] === 'subscriptions');
        await mutate('users/me');
      }
    } catch (error) {
      console.error('[SubscriptionMigrationHandler] Failed to finalize local migration', error);
    } finally {
      isMigrating.current = false;
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated' || attemptedInitialMigration.current) return;
    attemptedInitialMigration.current = true;
    void migrateLocalSubscriptions();
  }, [migrateLocalSubscriptions, status]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const handleRetry = () => {
      void migrateLocalSubscriptions();
    };

    window.addEventListener(LOCAL_SUBSCRIPTIONS_MIGRATION_REQUESTED_EVENT, handleRetry);
    return () => {
      window.removeEventListener(LOCAL_SUBSCRIPTIONS_MIGRATION_REQUESTED_EVENT, handleRetry);
    };
  }, [migrateLocalSubscriptions, status]);

  return null;
}
