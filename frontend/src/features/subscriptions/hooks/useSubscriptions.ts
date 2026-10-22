'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useSession } from '@/providers/SessionProvider';
import type { TrackedSubscription, CreateTrackedSubscriptionInput, UpdateTrackedSubscriptionInput, ListMeta } from '@/types';
import { subscriptionApi, type SubscriptionListParams } from '@/features/subscriptions/api/subscription-client';
import { reorderSubscriptionsWithHiddenItems } from '@/features/subscriptions/lib/reorder';
import { applySubscriptionFilters, buildSubscriptionSummary } from '@/features/subscriptions/lib/subscription-filters';
import {
  AUTHENTICATED_SUBSCRIPTIONS_UPDATED_EVENT,
  emptyAuthenticatedSubscriptionsState,
  queueAuthenticatedCreate,
  queueAuthenticatedDelete,
  queueAuthenticatedReorder,
  queueAuthenticatedUpdate,
  readAuthenticatedSubscriptionsState,
  reconcileAuthenticatedSubscriptionsFromServer,
  resolveAuthenticatedSubscriptionId,
  type AuthenticatedSubscriptionsState,
} from '@/features/subscriptions/lib/authenticated-sync-storage';
import {
  AUTHENTICATED_SYNC_ACTIVITY_EVENT,
  AUTHENTICATED_AUTO_ATTEMPT_LIMIT,
  isAuthenticatedSyncActive,
  nextAuthenticatedRetryDelay,
  syncAuthenticatedSubscriptions,
  withAuthenticatedStorageLock,
} from '@/features/subscriptions/lib/authenticated-sync';

const EMPTY_SUBSCRIPTIONS: TrackedSubscription[] = [];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '同期に失敗しました。変更はこの端末に残っています。';
}

export function useSubscriptions(params: SubscriptionListParams | null = {}) {
  const { user, status } = useSession();
  const userId = user?.id ?? null;
  const enabled = Boolean(params !== null && status === 'authenticated' && userId);
  const currentUserRef = useRef<string | null>(null);
  currentUserRef.current = enabled ? userId : null;
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [stored, setStored] = useState<{ userId: string | null; state: AuthenticatedSubscriptionsState }>({ userId: null, state: emptyAuthenticatedSubscriptionsState() });
  const [initializedUser, setInitializedUser] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activityVersion, setActivityVersion] = useState(0);
  const authenticatedState = useMemo(() => stored.userId === userId ? stored.state : emptyAuthenticatedSubscriptionsState(), [stored, userId]);
  const isSyncing = Boolean(userId && isAuthenticatedSyncActive(userId));

  useEffect(() => {
    const online = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
    };
  }, []);

  useEffect(() => {
    currentUserRef.current = enabled ? userId : null;
    if (!enabled || !userId) {
      setStored({ userId: null, state: emptyAuthenticatedSubscriptionsState() });
      setInitializedUser(null);
      setStorageError(null);
      return;
    }
    const refresh = () => {
      try {
        setStored({ userId, state: readAuthenticatedSubscriptionsState(userId) });
        setStorageError(null);
      } catch (error) {
        setStorageError(errorMessage(error));
      }
      setInitializedUser(userId);
    };
    const activity = () => setActivityVersion((value) => value + 1);
    refresh();
    window.addEventListener(AUTHENTICATED_SUBSCRIPTIONS_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener(AUTHENTICATED_SYNC_ACTIVITY_EVENT, activity);
    return () => {
      if (currentUserRef.current === userId) currentUserRef.current = null;
      window.removeEventListener(AUTHENTICATED_SUBSCRIPTIONS_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener(AUTHENTICATED_SYNC_ACTIVITY_EVENT, activity);
    };
  }, [enabled, userId]);

  const { error, isLoading, isValidating, mutate: refreshServerList } = useSWR(
    enabled && isOnline ? ['subscriptions', 'all', userId] : null,
    async () => {
      if (!userId) return;
      // A response is usable only against the local revision from which its request began.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const revision = readAuthenticatedSubscriptionsState(userId).revision ?? 0;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const request = subscriptionApi.list(userId, controller.signal);
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('一覧の更新がタイムアウトしました。')); }, 15_000);
        });
        const response = await Promise.race([request, timeout]).finally(() => clearTimeout(timer));
        if (currentUserRef.current !== userId) return;
        const result = await withAuthenticatedStorageLock(() => reconcileAuthenticatedSubscriptionsFromServer(userId, response, revision));
        if (result.accepted) return result.state.subscriptions;
      }
      return readAuthenticatedSubscriptionsState(userId).subscriptions;
    },
    { revalidateOnFocus: true, errorRetryCount: 2, errorRetryInterval: 5_000 },
  );

  const syncNow = useCallback(async () => {
    if (!userId || !enabled || !navigator.onLine) return;
    try {
      await syncAuthenticatedSubscriptions(userId, { manual: true, isCurrentUser: () => currentUserRef.current === userId });
      if (currentUserRef.current === userId) await refreshServerList();
    } catch (error) {
      if (currentUserRef.current === userId) setStorageError(errorMessage(error));
    }
  }, [enabled, refreshServerList, userId]);

  useEffect(() => {
    if (!enabled || !userId || !isOnline || storageError || isSyncing || !authenticatedState.pendingOperations.length) return;
    let delay: number | null;
    try {
      delay = nextAuthenticatedRetryDelay(userId);
    } catch (error) {
      setStorageError(errorMessage(error));
      return;
    }
    if (delay === null) return;
    const timer = setTimeout(() => {
      void syncAuthenticatedSubscriptions(userId, { isCurrentUser: () => currentUserRef.current === userId })
        .then(() => { if (currentUserRef.current === userId) void refreshServerList(); })
        .catch((error) => { if (currentUserRef.current === userId) setStorageError(errorMessage(error)); });
    }, delay);
    return () => clearTimeout(timer);
  }, [activityVersion, authenticatedState.pendingOperations, enabled, isOnline, isSyncing, refreshServerList, storageError, userId]);

  const currentSubscriptions = enabled ? authenticatedState.subscriptions : EMPTY_SUBSCRIPTIONS;
  const filteredSubscriptions = useMemo(() => applySubscriptionFilters(currentSubscriptions, params ?? {}), [currentSubscriptions, params]);
  const meta = useMemo<ListMeta | undefined>(() => userId ? ({
    page: 1,
    limit: Math.max(filteredSubscriptions.length, 1),
    total: filteredSubscriptions.length,
    totalPages: 1,
    summary: buildSubscriptionSummary(currentSubscriptions),
  }) : undefined, [currentSubscriptions, filteredSubscriptions.length, userId]);

  const saveLocalChange = useCallback(async <T,>(change: () => T): Promise<T> => {
    try {
      const result = await withAuthenticatedStorageLock(change);
      setStorageError(null);
      return result;
    } catch (error) {
      setStorageError(errorMessage(error));
      throw error;
    }
  }, []);
  const requireUser = useCallback(() => {
    if (!userId || currentUserRef.current !== userId) throw new Error('ログイン状態が変わりました。もう一度お試しください。');
    return userId;
  }, [userId]);
  const create = useCallback(async (input: CreateTrackedSubscriptionInput): Promise<TrackedSubscription> => {
    const owner = requireUser();
    const { state, subscription } = await saveLocalChange(() => queueAuthenticatedCreate(requireUser(), input));
    setStored({ userId: owner, state });
    return subscription;
  }, [requireUser, saveLocalChange]);
  const update = useCallback(async (id: string, input: UpdateTrackedSubscriptionInput): Promise<TrackedSubscription> => {
    const owner = requireUser();
    const state = await saveLocalChange(() => queueAuthenticatedUpdate(requireUser(), id, input));
    setStored({ userId: owner, state });
    const updated = state.subscriptions.find((item) => item.id === resolveAuthenticatedSubscriptionId(state, id));
    if (!updated) throw new Error('変更対象が見つかりません。');
    return updated;
  }, [requireUser, saveLocalChange]);
  const remove = useCallback(async (id: string): Promise<void> => {
    const owner = requireUser();
    const state = await saveLocalChange(() => queueAuthenticatedDelete(requireUser(), id));
    setStored({ userId: owner, state });
  }, [requireUser, saveLocalChange]);
  const reorder = useCallback(async (draggedId: string, targetId: string): Promise<void> => {
    const owner = requireUser();
    const state = await saveLocalChange(() => {
      requireUser();
      const current = readAuthenticatedSubscriptionsState(owner);
      const all = current.subscriptions;
      const visible = applySubscriptionFilters(all, params ?? {});
      const reordered = reorderSubscriptionsWithHiddenItems(all, visible, resolveAuthenticatedSubscriptionId(current, draggedId), resolveAuthenticatedSubscriptionId(current, targetId));
      return queueAuthenticatedReorder(owner, reordered);
    });
    setStored({ userId: owner, state });
  }, [params, requireUser, saveLocalChange]);

  return {
    subscriptions: filteredSubscriptions,
    meta,
    isLoading: (enabled && initializedUser !== userId) || (currentSubscriptions.length === 0 && isLoading),
    isValidating,
    error: currentSubscriptions.length ? null : error,
    create, update, remove, reorder,
    syncState: {
      pendingCount: authenticatedState.pendingOperations.length,
      isSyncing,
      syncError: storageError ?? authenticatedState.migrationError ?? authenticatedState.syncError ?? (error ? errorMessage(error) : null)
        ?? (!isSyncing && authenticatedState.pendingOperations.some((operation) => (operation.attemptCount ?? 0) >= AUTHENTICATED_AUTO_ATTEMPT_LIMIT)
          ? '自動同期を中断しました。変更はこの端末に保存されています。同期を再試行してください。' : null),
      lastSyncedAt: authenticatedState.lastSyncedAt,
      isOfflineReady: currentSubscriptions.length > 0 || authenticatedState.pendingOperations.length > 0,
      isOnline,
    },
    syncNow,
  };
}
