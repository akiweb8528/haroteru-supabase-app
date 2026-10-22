'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSession } from '@/providers/SessionProvider';
import type { TrackedSubscription } from '@/types';
import { withAuthenticatedStorageLock } from '@/features/subscriptions/lib/authenticated-sync';
import {
  queueAuthenticatedGuestImport,
  readAuthenticatedSubscriptionsState,
  setAuthenticatedMigrationError,
} from '@/features/subscriptions/lib/authenticated-sync-storage';
import {
  LOCAL_SUBSCRIPTIONS_MIGRATION_REQUESTED_EVENT,
  readLocalSubscriptionsForMigration,
  removeMigratedLocalSubscriptions,
} from '@/features/subscriptions/lib/local-storage';

const migrationErrorPrefix = '端末データの移行を完了できませんでした。';

export function SubscriptionMigrationHandler() {
  const { user, status } = useSession();
  const userId = status === 'authenticated' ? user?.id ?? null : null;
  const currentOwner = useRef(userId);
  currentOwner.current = userId;
  const lastAttemptedOwner = useRef<string | null>(null);
  const migratingOwners = useRef(new Set<string>());

  useEffect(() => {
    currentOwner.current = userId;
    return () => { if (currentOwner.current === userId) currentOwner.current = null; };
  }, [userId]);

  const migrateLocalSubscriptions = useCallback(async () => {
    const owner = userId;
    if (!owner || migratingOwners.current.has(owner)) return;
    migratingOwners.current.add(owner);
    try {
      await withAuthenticatedStorageLock(() => {
        if (currentOwner.current !== owner) return;
        const source = readLocalSubscriptionsForMigration().sort((a, b) => a.position - b.position);
        const copied: TrackedSubscription[] = [];
        let failure: unknown;
        for (const item of source) {
          if (currentOwner.current !== owner) break;
          try {
            queueAuthenticatedGuestImport(owner, item);
            copied.push(item);
          } catch (error) {
            failure = error;
          }
        }
        removeMigratedLocalSubscriptions(copied);
        if (failure) throw failure;
        if (readAuthenticatedSubscriptionsState(owner).migrationError) {
          setAuthenticatedMigrationError(owner, null);
        }
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '元データはこの端末に残っています。';
      console.error('[SubscriptionMigrationHandler] Failed to transfer guest subscriptions', error);
      try {
        await withAuthenticatedStorageLock(() => setAuthenticatedMigrationError(owner, `${migrationErrorPrefix}${detail}`));
      } catch (storageError) {
        console.error('[SubscriptionMigrationHandler] Failed to save migration status', storageError);
      }
    } finally {
      migratingOwners.current.delete(owner);
    }
  }, [userId]);

  useEffect(() => {
    if (lastAttemptedOwner.current === userId) return;
    lastAttemptedOwner.current = userId;
    if (userId) void migrateLocalSubscriptions();
  }, [migrateLocalSubscriptions, userId]);

  useEffect(() => {
    if (!userId) return;
    const handleRetry = () => { void migrateLocalSubscriptions(); };
    window.addEventListener(LOCAL_SUBSCRIPTIONS_MIGRATION_REQUESTED_EVENT, handleRetry);
    return () => window.removeEventListener(LOCAL_SUBSCRIPTIONS_MIGRATION_REQUESTED_EVENT, handleRetry);
  }, [migrateLocalSubscriptions, userId]);

  return null;
}
