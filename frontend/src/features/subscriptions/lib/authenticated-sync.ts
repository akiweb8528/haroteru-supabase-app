import type { TrackedSubscription } from '@/types';
import { subscriptionApi } from '@/features/subscriptions/api/subscription-client';
import {
  acknowledgeAuthenticatedPendingOperation,
  claimAuthenticatedPendingOperation,
  isTemporarySubscriptionId,
  readAuthenticatedSubscriptionsState,
  rejectAuthenticatedPendingOperation,
  setAuthenticatedSyncError,
  type PendingSubscriptionOperation,
} from './authenticated-sync-storage';

export const AUTHENTICATED_SYNC_ACTIVITY_EVENT = 'authenticated-sync-activity';
const active = new Map<string, Promise<void>>();
export const AUTHENTICATED_AUTO_ATTEMPT_LIMIT = 5;
const REQUEST_TIMEOUT_MS = 15_000;

export function isAuthenticatedSyncActive(userId: string): boolean {
  return active.has(userId);
}
export function withAuthenticatedStorageLock<T>(change: () => T): Promise<T> {
  if (navigator.locks?.request) return navigator.locks.request('haroteru-subscriptions-storage', change);
  return Promise.resolve().then(change);
}
function notifyActivity() {
  window.dispatchEvent(new Event(AUTHENTICATED_SYNC_ACTIVITY_EVENT));
}
function targets(operation: PendingSubscriptionOperation): string[] {
  return operation.type === 'reorder' ? operation.items.map((item) => item.id) : [operation.targetId];
}
function dependsOn(operation: PendingSubscriptionOperation, earlier: PendingSubscriptionOperation): boolean {
  // Reorders share list-wide ordering, including a create/delete that changes its membership.
  if (operation.type === 'reorder' || earlier.type === 'reorder') return true;
  const ids = targets(earlier);
  return targets(operation).some((id) => ids.includes(id));
}
export function authenticatedRetryDelay(operation: PendingSubscriptionOperation, now = Date.now()): number | null {
  const attempts = operation.attemptCount ?? 0;
  if (attempts >= AUTHENTICATED_AUTO_ATTEMPT_LIMIT) return null;
  if (!attempts || !operation.lastAttemptAt) return 0;
  const lastAttempt = Date.parse(operation.lastAttemptAt);
  if (!Number.isFinite(lastAttempt) || lastAttempt > now) return 0;
  return Math.max(0, lastAttempt + Math.min(60_000, 2_000 * 2 ** (attempts - 1)) - now);
}
export function nextAuthenticatedRetryDelay(userId: string): number | null {
  const operations = readAuthenticatedSubscriptionsState(userId).pendingOperations;
  const delays = operations.flatMap((operation, index) => {
    if (operations.slice(0, index).some((earlier) => dependsOn(operation, earlier))) return [];
    const delay = authenticatedRetryDelay(operation);
    return delay === null ? [] : [delay];
  });
  return delays.length ? Math.min(...delays) : null;
}

async function send(userId: string, operation: PendingSubscriptionOperation, signal: AbortSignal): Promise<TrackedSubscription | undefined> {
  if (operation.type === 'create') return subscriptionApi.create(operation.payload, operation.id, userId, signal);
  if (operation.type === 'update') {
    if (isTemporarySubscriptionId(operation.targetId)) throw new Error('作成の同期を待っています。');
    await subscriptionApi.update(operation.targetId, operation.payload, operation.id, userId, signal);
  } else if (operation.type === 'delete') {
    if (isTemporarySubscriptionId(operation.targetId)) throw new Error('作成の同期を待っています。');
    await subscriptionApi.delete(operation.targetId, operation.id, userId, signal);
  } else {
    if (operation.items.some((item) => isTemporarySubscriptionId(item.id))) throw new Error('作成の同期を待っています。');
    if (operation.items.length) await subscriptionApi.reorder({ items: operation.items }, operation.id, userId, signal);
  }
  return undefined;
}

export function syncAuthenticatedSubscriptions(
  userId: string,
  options: { manual?: boolean; isCurrentUser: () => boolean },
): Promise<void> {
  const running = active.get(userId);
  if (running) return running;
  const run = async () => {
    const attempted = new Set<string>();
    let failure: string | null = null;
    while (options.isCurrentUser() && navigator.onLine && attempted.size < 100) {
      const pending = readAuthenticatedSubscriptionsState(userId).pendingOperations;
      const candidate = pending.find((operation, index) => (
        !attempted.has(operation.id)
        && !pending.slice(0, index).some((earlier) => dependsOn(operation, earlier))
        && (options.manual || authenticatedRetryDelay(operation) === 0)
      ));
      if (!candidate) break;
      const operation = await withAuthenticatedStorageLock(() => claimAuthenticatedPendingOperation(userId, candidate.id));
      if (!operation) continue;
      attempted.add(operation.id);
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('同期がタイムアウトしました。変更はこの端末に残っています。'));
          }, REQUEST_TIMEOUT_MS);
        });
        const created = await Promise.race([send(userId, operation, controller.signal), timeout]);
        // The captured owner remains correct even if sign-out happened while awaiting the response.
        await withAuthenticatedStorageLock(() => acknowledgeAuthenticatedPendingOperation(userId, operation.id, created));
      } catch (error) {
        failure = error instanceof Error ? error.message : '同期に失敗しました。変更はこの端末に残っています。';
        await withAuthenticatedStorageLock(() => {
          if (error && typeof error === 'object' && 'definitivelyRejected' in error && error.definitivelyRejected === true) {
            rejectAuthenticatedPendingOperation(userId, operation.id, failure ?? undefined);
          }
          setAuthenticatedSyncError(userId, failure);
        });
      } finally {
        clearTimeout(timer);
      }
    }
    if (!readAuthenticatedSubscriptionsState(userId).pendingOperations.length) {
      await withAuthenticatedStorageLock(() => setAuthenticatedSyncError(userId, null));
    }
  };
  const lockedRun = async () => {
    if (navigator.locks?.request) {
      await navigator.locks.request(`haroteru-subscriptions:${userId}`, run);
    } else {
      await run();
    }
  };
  // Defer until the map contains this promise so simultaneous hooks share one sender.
  const promise = Promise.resolve().then(lockedRun).finally(() => {
    active.delete(userId);
    notifyActivity();
  });
  active.set(userId, promise);
  notifyActivity();
  return promise;
}
