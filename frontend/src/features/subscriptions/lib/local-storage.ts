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
