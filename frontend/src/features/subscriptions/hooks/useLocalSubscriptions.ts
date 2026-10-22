'use client';

import { useEffect, useState, useCallback } from 'react';
import type {
  TrackedSubscription,
  CreateTrackedSubscriptionInput,
  UpdateTrackedSubscriptionInput,
  ListMeta,
} from '@/types';
import type { SubscriptionListParams } from '@/features/subscriptions/api/subscription-client';
import {
  readLocalSubscriptions,
  writeLocalSubscriptions,
} from '@/features/subscriptions/lib/local-storage';
import { reorderSubscriptionsWithHiddenItems } from '@/features/subscriptions/lib/reorder';
import { applySubscriptionFilters, buildSubscriptionSummary } from '@/features/subscriptions/lib/subscription-filters';

export function useLocalSubscriptions(params: SubscriptionListParams = {}) {
  const [allSubscriptions, setAllSubscriptions] = useState<TrackedSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setAllSubscriptions(readLocalSubscriptions());
    setIsLoading(false);
  }, []);

  const create = useCallback(async (input: CreateTrackedSubscriptionInput): Promise<TrackedSubscription> => {
    const now = new Date().toISOString();
    const current = readLocalSubscriptions();
    const maxPos = current.reduce((m, item) => Math.max(m, item.position), -1);
    const item: TrackedSubscription = {
      id: crypto.randomUUID(),
      userId: 'local',
      name: input.name,
      amountYen: input.amountYen,
      billingCycle: input.billingCycle,
      category: input.category,
      reviewPriority: input.reviewPriority,
      locked: input.locked ?? false,
      billingDay: input.billingDay,
      note: input.note ?? '',
      position: maxPos + 1,
      createdAt: now,
      updatedAt: now,
    };
    const next = [...current, item];
    writeLocalSubscriptions(next);
    setAllSubscriptions(next);
    return item;
  }, []);

  const update = useCallback(async (id: string, input: UpdateTrackedSubscriptionInput): Promise<TrackedSubscription> => {
    const current = readLocalSubscriptions();
    let updated!: TrackedSubscription;
    const next = current.map((item) => {
      if (item.id !== id) return item;
      updated = {
        ...item,
        ...input,
        category: input.clearCategory ? undefined : input.category !== undefined ? input.category : item.category,
        billingDay: input.clearBillingDay ? undefined : input.billingDay !== undefined ? input.billingDay : item.billingDay,
        note: input.note !== undefined ? input.note : item.note,
        updatedAt: new Date().toISOString(),
      };
      return updated;
    });
    writeLocalSubscriptions(next);
    setAllSubscriptions(next);
    return updated;
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    const next = readLocalSubscriptions().filter((item) => item.id !== id);
    writeLocalSubscriptions(next);
    setAllSubscriptions(next);
  }, []);

  const reorder = useCallback(async (draggedId: string, targetId: string): Promise<void> => {
    const current = readLocalSubscriptions();
    const visible = applySubscriptionFilters(current, params);
    const next = reorderSubscriptionsWithHiddenItems(current, visible, draggedId, targetId);
    writeLocalSubscriptions(next);
    setAllSubscriptions(next);
  }, [params]);

  const filtered = applySubscriptionFilters(allSubscriptions, params);
  const meta: ListMeta = {
    page: 1,
    limit: Math.max(filtered.length, 1),
    total: filtered.length,
    totalPages: 1,
    summary: buildSubscriptionSummary(allSubscriptions),
  };

  return {
    subscriptions: filtered,
    meta,
    isLoading,
    isValidating: false,
    error: null as Error | null,
    create,
    update,
    remove,
    reorder,
    syncState: {
      pendingCount: 0,
      isSyncing: false,
      syncError: null,
      lastSyncedAt: null,
      isOfflineReady: true,
      isOnline: true,
    },
    syncNow: async () => {},
  };
}
