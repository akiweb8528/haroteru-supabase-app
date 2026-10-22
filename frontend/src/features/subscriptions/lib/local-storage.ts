'use client';

import type { TrackedSubscription } from '@/types';

export const LOCAL_SUBSCRIPTIONS_STORAGE_KEY = 'local_subscriptions';
export const LOCAL_SUBSCRIPTIONS_UPDATED_EVENT = 'local-subscriptions-updated';
export const LOCAL_SUBSCRIPTIONS_MIGRATION_REQUESTED_EVENT = 'local-subscriptions-migration-requested';

function notifyLocalSubscriptionsUpdated() {
  window.dispatchEvent(new Event(LOCAL_SUBSCRIPTIONS_UPDATED_EVENT));
}

export function readLocalSubscriptions(): TrackedSubscription[] {
  try {
    const raw = localStorage.getItem(LOCAL_SUBSCRIPTIONS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TrackedSubscription[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalSubscriptions(items: TrackedSubscription[]): void {
  try {
    localStorage.setItem(LOCAL_SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(items));
    notifyLocalSubscriptionsUpdated();
  } catch {}
}

export function clearLocalSubscriptions(): void {
  try {
    localStorage.removeItem(LOCAL_SUBSCRIPTIONS_STORAGE_KEY);
    notifyLocalSubscriptionsUpdated();
  } catch {}
}

export function hasLocalSubscriptions(): boolean {
  return readLocalSubscriptions().length > 0;
}

export function requestLocalSubscriptionsMigration(): void {
  window.dispatchEvent(new Event(LOCAL_SUBSCRIPTIONS_MIGRATION_REQUESTED_EVENT));
}

export function readLocalSubscriptionsForMigration(): TrackedSubscription[] {
  try {
    const raw = localStorage.getItem(LOCAL_SUBSCRIPTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id)) {
      throw new Error('Invalid guest subscriptions');
    }
    return parsed as TrackedSubscription[];
  } catch {
    throw new Error('この端末の元データを読み込めません。保存内容を保護して移行を中断しました。');
  }
}

export function removeMigratedLocalSubscriptions(copied: TrackedSubscription[]): void {
  if (!copied.length) return;
  const snapshots = new Set(copied.map((item) => JSON.stringify(item)));
  const current = readLocalSubscriptionsForMigration();
  const remaining = current.filter((item) => !snapshots.has(JSON.stringify(item)));
  if (remaining.length === current.length) return;
  try {
    if (remaining.length) localStorage.setItem(LOCAL_SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(remaining));
    else localStorage.removeItem(LOCAL_SUBSCRIPTIONS_STORAGE_KEY);
  } catch {
    throw new Error('移行先には保存しましたが、この端末の元データを整理できませんでした。再試行しても項目は重複しません。');
  }
  notifyLocalSubscriptionsUpdated();
}
