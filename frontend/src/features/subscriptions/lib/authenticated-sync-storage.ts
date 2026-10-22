'use client';

import type {
  CreateTrackedSubscriptionInput,
  TrackedSubscription,
  UpdateTrackedSubscriptionInput,
} from '@/types';

export const AUTHENTICATED_SUBSCRIPTIONS_UPDATED_EVENT = 'authenticated-subscriptions-updated';

// Keep the v1 key so existing cached subscriptions and unsent operations are migrated in place.
const AUTHENTICATED_SUBSCRIPTIONS_STORAGE_KEY = 'authenticated_subscriptions_sync_v1';
const TEMP_SUBSCRIPTION_ID_PREFIX = 'local-auth-';

type OperationMetadata = {
  id: string;
  createdAt: string;
  attemptCount?: number;
  lastAttemptAt?: string;
  definitivelyRejected?: boolean;
  rejectionReason?: string;
};

export type PendingSubscriptionOperation = OperationMetadata & (
  | { type: 'create'; targetId: string; payload: CreateTrackedSubscriptionInput }
  | { type: 'update'; targetId: string; payload: UpdateTrackedSubscriptionInput }
  | { type: 'delete'; targetId: string }
  | { type: 'reorder'; items: { id: string; position: number }[] }
);

export interface AuthenticatedSubscriptionsState {
  subscriptions: TrackedSubscription[];
  pendingOperations: PendingSubscriptionOperation[];
  syncError: string | null;
  migrationError?: string | null;
  lastSyncedAt: string | null;
  revision?: number;
  temporaryIdMap?: Record<string, string>;
  importedGuestIds?: Record<string, { targetId: string; snapshots: string[] }>;
}

type AuthenticatedSubscriptionsStorageShape = Record<string, AuthenticatedSubscriptionsState>;

export class AuthenticatedSubscriptionsStorageError extends Error {
  constructor() {
    super('ブラウザへの保存を確認できません。保存領域を確認してからもう一度お試しください。');
    this.name = 'AuthenticatedSubscriptionsStorageError';
  }
}

function dispatchAuthenticatedSubscriptionsUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTHENTICATED_SUBSCRIPTIONS_UPDATED_EVENT));
  }
}

function readStorage(): AuthenticatedSubscriptionsStorageShape {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = localStorage.getItem(AUTHENTICATED_SUBSCRIPTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid subscription storage');
    }
    return parsed as AuthenticatedSubscriptionsStorageShape;
  } catch {
    // An unreadable store must never become an empty store that the next edit overwrites.
    throw new AuthenticatedSubscriptionsStorageError();
  }
}

function writeStorage(next: AuthenticatedSubscriptionsStorageShape) {
  if (typeof window === 'undefined') {
    throw new AuthenticatedSubscriptionsStorageError();
  }
  try {
    localStorage.setItem(AUTHENTICATED_SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    throw new AuthenticatedSubscriptionsStorageError();
  }
  dispatchAuthenticatedSubscriptionsUpdated();
}

export function emptyAuthenticatedSubscriptionsState(): AuthenticatedSubscriptionsState {
  return {
    subscriptions: [], pendingOperations: [], syncError: null, lastSyncedAt: null,
    revision: 0, temporaryIdMap: {},
  };
}

export function isTemporarySubscriptionId(id: string): boolean {
  return id.startsWith(TEMP_SUBSCRIPTION_ID_PREFIX);
}

function buildOperationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeSubscriptionPositions(items: TrackedSubscription[]): TrackedSubscription[] {
  return items.map((item, position) => ({ ...item, position }));
}

export function resolveAuthenticatedSubscriptionId(state: AuthenticatedSubscriptionsState, id: string): string {
  return state.temporaryIdMap?.[id] ?? id;
}

function nextRevision(state: AuthenticatedSubscriptionsState) {
  return (state.revision ?? 0) + 1;
}

function buildCreatedSubscription(
  userId: string,
  input: CreateTrackedSubscriptionInput,
  id: string,
  position: number,
  createdAt: string,
): TrackedSubscription {
  return {
    id, userId, name: input.name, amountYen: input.amountYen,
    billingCycle: input.billingCycle, category: input.category,
    reviewPriority: input.reviewPriority, locked: input.locked ?? false,
    billingDay: input.billingDay, note: input.note ?? '', position,
    createdAt, updatedAt: createdAt,
  };
}

function applyUpdateToSubscriptions(
  items: TrackedSubscription[],
  id: string,
  input: UpdateTrackedSubscriptionInput,
  updatedAt: string,
): TrackedSubscription[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      name: input.name ?? item.name,
      amountYen: input.amountYen ?? item.amountYen,
      billingCycle: input.billingCycle ?? item.billingCycle,
      category: input.clearCategory ? undefined : (input.category ?? item.category),
      reviewPriority: input.reviewPriority ?? item.reviewPriority,
      locked: input.locked ?? item.locked,
      billingDay: input.clearBillingDay ? undefined : (input.billingDay ?? item.billingDay),
      note: input.note ?? item.note,
      updatedAt,
    };
  });
}

export function readAuthenticatedSubscriptionsState(userId: string): AuthenticatedSubscriptionsState {
  const all = readStorage();
  const state = Object.hasOwn(all, userId) ? all[userId] : undefined;
  if (state === undefined) return emptyAuthenticatedSubscriptionsState();
  if (!state || !Array.isArray(state.subscriptions) || !Array.isArray(state.pendingOperations)) {
    throw new AuthenticatedSubscriptionsStorageError();
  }
  return {
    ...state,
    revision: state.revision ?? 0,
    temporaryIdMap: state.temporaryIdMap ?? {},
  };
}

export function writeAuthenticatedSubscriptionsState(userId: string, state: AuthenticatedSubscriptionsState) {
  const all = readStorage();
  Object.defineProperty(all, userId, { value: state, enumerable: true, writable: true, configurable: true });
  writeStorage(all);
}

function appendOperation(
  userId: string,
  current: AuthenticatedSubscriptionsState,
  subscriptions: TrackedSubscription[],
  operation: PendingSubscriptionOperation,
): AuthenticatedSubscriptionsState {
  const next: AuthenticatedSubscriptionsState = {
    ...current,
    subscriptions: normalizeSubscriptionPositions(subscriptions),
    pendingOperations: [...current.pendingOperations, operation],
    syncError: null,
    revision: nextRevision(current),
  };
  writeAuthenticatedSubscriptionsState(userId, next);
  return next;
}

function fullCreatePayload(item: TrackedSubscription): CreateTrackedSubscriptionInput {
  return {
    name: item.name, amountYen: item.amountYen, billingCycle: item.billingCycle,
    category: item.category, reviewPriority: item.reviewPriority, locked: item.locked,
    billingDay: item.billingDay, note: item.note,
  };
}

function correctedOperation(
  rejected: PendingSubscriptionOperation,
  targetId: string,
  item: TrackedSubscription,
): PendingSubscriptionOperation {
  const payload = fullCreatePayload(item);
  const metadata = { id: buildOperationId(), targetId, createdAt: new Date().toISOString() };
  return rejected.type === 'create'
    ? { ...metadata, type: 'create', payload }
    : { ...metadata, type: 'update', payload: { ...payload, clearCategory: item.category === undefined, clearBillingDay: item.billingDay === undefined } };
}

function canSupersede(operation: PendingSubscriptionOperation): boolean {
  return Boolean(operation.definitivelyRejected) || (operation.attemptCount ?? 0) === 0;
}

function rejectedTargetOperation(current: AuthenticatedSubscriptionsState, targetId: string) {
  return current.pendingOperations.find((operation) => (
    (operation.type === 'create' || operation.type === 'update')
    && operation.targetId === targetId && operation.definitivelyRejected
  ));
}

function replaceRejectedTargetOperations(
  current: AuthenticatedSubscriptionsState,
  rejected: PendingSubscriptionOperation,
  targetId: string,
  replacement?: PendingSubscriptionOperation,
): PendingSubscriptionOperation[] | null {
  const related = current.pendingOperations.filter((operation) => (
    operation.type !== 'reorder' && operation.targetId === targetId
  ));
  if (related.some((operation) => !canSupersede(operation))) return null;
  if (related.some((operation) => operation.type === 'create' && operation.id !== rejected.id)) return null;
  if (!replacement && rejected.type === 'create' && current.pendingOperations.some((operation) => (
    operation.type === 'reorder' && operation.items.some((item) => item.id === targetId) && !canSupersede(operation)
  ))) return null;

  return current.pendingOperations.flatMap((operation) => {
    if (operation.id === rejected.id) return replacement ? [replacement] : [];
    if (operation.type !== 'reorder' && operation.targetId === targetId) return [];
    if (!replacement && rejected.type === 'create' && operation.type === 'reorder' && operation.items.some((item) => item.id === targetId)) {
      const items = operation.items.filter((item) => item.id !== targetId).map((item, position) => ({ ...item, position }));
      return items.length ? [{ type: 'reorder' as const, id: buildOperationId(), createdAt: new Date().toISOString(), items }] : [];
    }
    return [operation];
  });
}

function saveRecoveredState(
  userId: string,
  current: AuthenticatedSubscriptionsState,
  subscriptions: TrackedSubscription[],
  pendingOperations: PendingSubscriptionOperation[],
): AuthenticatedSubscriptionsState {
  const next: AuthenticatedSubscriptionsState = {
    ...current, subscriptions: normalizeSubscriptionPositions(subscriptions), pendingOperations,
    revision: nextRevision(current), syncError: null,
  };
  writeAuthenticatedSubscriptionsState(userId, next);
  return next;
}

export function queueAuthenticatedCreate(
  userId: string,
  input: CreateTrackedSubscriptionInput,
): { state: AuthenticatedSubscriptionsState; subscription: TrackedSubscription } {
  const current = readAuthenticatedSubscriptionsState(userId);
  const createdAt = new Date().toISOString();
  const subscription = buildCreatedSubscription(
    userId, input, `${TEMP_SUBSCRIPTION_ID_PREFIX}${buildOperationId()}`, current.subscriptions.length, createdAt,
  );
  const state = appendOperation(userId, current, [...current.subscriptions, subscription], {
    id: buildOperationId(), type: 'create', targetId: subscription.id, payload: { ...input }, createdAt,
  });
  return { state, subscription };
}

export function queueAuthenticatedGuestImport(userId: string, guest: TrackedSubscription): AuthenticatedSubscriptionsState {
  if (!guest.id || typeof guest.id !== 'string') throw new AuthenticatedSubscriptionsStorageError();
  const all = readStorage();
  for (const [ownerId, state] of Object.entries(all)) {
    if (!state || typeof state !== 'object') throw new AuthenticatedSubscriptionsStorageError();
    const markers = state.importedGuestIds;
    if (markers !== undefined && (!markers || typeof markers !== 'object' || Array.isArray(markers))) {
      throw new AuthenticatedSubscriptionsStorageError();
    }
    if (markers && Object.hasOwn(markers, guest.id) && ownerId !== userId) {
      throw new Error('この項目は別のアカウントへの移行が始まっています。元のアカウントで再試行してください。');
    }
  }
  const current = readAuthenticatedSubscriptionsState(userId);
  const markers = current.importedGuestIds ?? {};
  const previous = Object.hasOwn(markers, guest.id) ? markers[guest.id] : undefined;
  const snapshot = JSON.stringify(guest);
  if (previous && (!Array.isArray(previous.snapshots) || typeof previous.targetId !== 'string')) {
    throw new AuthenticatedSubscriptionsStorageError();
  }
  if (previous?.snapshots.includes(snapshot)) return current;
  const createdAt = new Date().toISOString();
  const payload = fullCreatePayload(guest);
  const targetId = previous
    ? resolveAuthenticatedSubscriptionId(current, previous.targetId)
    : `${TEMP_SUBSCRIPTION_ID_PREFIX}${buildOperationId()}`;
  // The import receipt and queued operation share one durable write. Receipts survive acknowledgement.
  const marked = {
    ...current,
    importedGuestIds: {
      ...markers,
      [guest.id]: { targetId, snapshots: [...(previous?.snapshots ?? []), snapshot] },
    },
  };
  if (previous) {
    if (!current.subscriptions.some((item) => item.id === targetId)) {
      throw new Error('移行先の項目が削除されています。変更された元データはこの端末に残っています。');
    }
    const update: UpdateTrackedSubscriptionInput = {
      ...payload, clearCategory: guest.category === undefined, clearBillingDay: guest.billingDay === undefined,
    };
    const subscriptions = applyUpdateToSubscriptions(current.subscriptions, targetId, update, createdAt);
    const rejected = rejectedTargetOperation(current, targetId);
    if (rejected) {
      const replacement = correctedOperation(rejected, targetId, subscriptions.find((item) => item.id === targetId)!);
      const recovered = replaceRejectedTargetOperations(marked, rejected, targetId, replacement);
      if (recovered) return saveRecoveredState(userId, marked, subscriptions, recovered);
    }
    return appendOperation(userId, marked, subscriptions, {
      id: buildOperationId(), type: 'update', targetId, payload: update, createdAt,
    });
  }
  const subscription = buildCreatedSubscription(userId, payload, targetId, current.subscriptions.length, createdAt);
  return appendOperation(userId, marked, [...current.subscriptions, subscription], {
    id: buildOperationId(), type: 'create', targetId, payload, createdAt,
  });
}

export function queueAuthenticatedUpdate(
  userId: string,
  id: string,
  input: UpdateTrackedSubscriptionInput,
): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const targetId = resolveAuthenticatedSubscriptionId(current, id);
  const createdAt = new Date().toISOString();
  const subscriptions = applyUpdateToSubscriptions(current.subscriptions, targetId, input, createdAt);
  const updated = subscriptions.find((item) => item.id === targetId);
  if (!updated) throw new Error('変更対象が見つかりません。');
  const rejected = rejectedTargetOperation(current, targetId);
  if (rejected) {
    const replacement = correctedOperation(rejected, targetId, updated);
    const recovered = replaceRejectedTargetOperations(current, rejected, targetId, replacement);
    if (recovered) return saveRecoveredState(userId, current, subscriptions, recovered);
  }
  return appendOperation(userId, current, subscriptions, {
    id: buildOperationId(), type: 'update', targetId, payload: { ...input }, createdAt,
  });
}

export function queueAuthenticatedDelete(userId: string, id: string): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const targetId = resolveAuthenticatedSubscriptionId(current, id);
  const subscriptions = current.subscriptions.filter((item) => item.id !== targetId);
  const rejected = rejectedTargetOperation(current, targetId);
  const operation: PendingSubscriptionOperation = {
    id: buildOperationId(), type: 'delete', targetId, createdAt: new Date().toISOString(),
  };
  if (rejected) {
    const recovered = replaceRejectedTargetOperations(current, rejected, targetId, rejected.type === 'create' ? undefined : operation);
    if (recovered) return saveRecoveredState(userId, current, subscriptions, recovered);
  }
  return appendOperation(userId, current, subscriptions, operation);
}

export function queueAuthenticatedReorder(
  userId: string,
  subscriptions: TrackedSubscription[],
): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const cached = new Map(current.subscriptions.map((item) => [item.id, item]));
  const orderedIds = [...new Set(subscriptions.map((item) => resolveAuthenticatedSubscriptionId(current, item.id)))];
  const selected = orderedIds.flatMap((id) => cached.has(id) ? [cached.get(id)!] : []);
  // A stale drag snapshot cannot resurrect a deleted item or drop a newly added one.
  const normalized = normalizeSubscriptionPositions([
    ...selected, ...current.subscriptions.filter((item) => !orderedIds.includes(item.id)),
  ]);
  const operation: PendingSubscriptionOperation = {
    id: buildOperationId(), type: 'reorder',
    items: normalized.map((item) => ({ id: item.id, position: item.position })),
    createdAt: new Date().toISOString(),
  };
  return appendOperation(userId, {
    ...current,
    pendingOperations: current.pendingOperations.filter((item) => item.type !== 'reorder' || !item.definitivelyRejected),
  }, normalized, operation);
}

function remapTemporaryId(
  current: AuthenticatedSubscriptionsState,
  fromId: string,
  toItem: TrackedSubscription,
): AuthenticatedSubscriptionsState {
  const hasOptimisticItem = current.subscriptions.some((item) => item.id === fromId);
  const remapped: AuthenticatedSubscriptionsState = {
    ...current,
    temporaryIdMap: { ...current.temporaryIdMap, [fromId]: toItem.id },
    // Keep the optimistic values: the response describes the older create, not subsequent edits.
    // A concurrent list may already contain the created server id before its POST response arrives.
    subscriptions: normalizeSubscriptionPositions(current.subscriptions.filter((item) => (
      !hasOptimisticItem || item.id !== toItem.id || item.id === fromId
    )).map((item) => item.id !== fromId ? item : {
      ...toItem, ...item, id: toItem.id, userId: toItem.userId, createdAt: toItem.createdAt,
    })),
    pendingOperations: current.pendingOperations.map((operation) => {
      if (operation.type === 'reorder') {
        return { ...operation, items: operation.items.map((item) => item.id === fromId ? { ...item, id: toItem.id } : item) };
      }
      return operation.targetId === fromId ? { ...operation, targetId: toItem.id } : operation;
    }),
  };
  return {
    ...remapped,
    subscriptions: overlayPendingOperations(toItem.userId, remapped.subscriptions, remapped),
  };
}

export function replaceAuthenticatedTemporaryId(
  userId: string,
  fromId: string,
  toItem: TrackedSubscription,
): AuthenticatedSubscriptionsState {
  if (toItem.userId !== userId) throw new Error('Subscription owner does not match the authenticated user');
  const current = readAuthenticatedSubscriptionsState(userId);
  const next = { ...remapTemporaryId(current, fromId, toItem), revision: nextRevision(current) };
  writeAuthenticatedSubscriptionsState(userId, next);
  return next;
}

export function claimAuthenticatedPendingOperation(
  userId: string,
  operationId: string,
): PendingSubscriptionOperation | null {
  const current = readAuthenticatedSubscriptionsState(userId);
  const operation = current.pendingOperations.find((item) => item.id === operationId);
  if (!operation) return null;
  const claimed = {
    ...operation, attemptCount: (operation.attemptCount ?? 0) + 1, lastAttemptAt: new Date().toISOString(),
    definitivelyRejected: undefined, rejectionReason: undefined,
  };
  writeAuthenticatedSubscriptionsState(userId, {
    ...current,
    pendingOperations: current.pendingOperations.map((item) => item.id === operationId ? claimed : item),
  });
  return claimed;
}

export function rejectAuthenticatedPendingOperation(
  userId: string,
  operationId: string,
  reason?: string,
): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const index = current.pendingOperations.findIndex((operation) => operation.id === operationId);
  if (index < 0) return current;
  const operation = current.pendingOperations[index];
  const next: AuthenticatedSubscriptionsState = {
    ...current,
    pendingOperations: current.pendingOperations.map((operation) => operation.id === operationId ? {
      ...operation, definitivelyRejected: true, rejectionReason: reason,
    } : operation),
  };
  if (operation.type === 'create' || operation.type === 'update') {
    const followups = next.pendingOperations.slice(index + 1).filter((item) => (
      (item.type === 'update' || item.type === 'delete') && item.targetId === operation.targetId
    ));
    if (followups.length && followups.every((item) => (item.attemptCount ?? 0) === 0)) {
      const rejected = next.pendingOperations[index];
      const item = next.subscriptions.find((item) => item.id === operation.targetId);
      const deleted = followups.some((item) => item.type === 'delete');
      let replacement: PendingSubscriptionOperation | undefined;
      let changed = deleted;
      if (deleted && operation.type === 'update') {
        replacement = { id: buildOperationId(), type: 'delete', targetId: operation.targetId, createdAt: new Date().toISOString() };
      } else if (!deleted && item) {
        replacement = correctedOperation(operation, operation.targetId, item);
        if (operation.type === 'create') {
          const previous = buildCreatedSubscription(userId, operation.payload, operation.targetId, 0, operation.createdAt);
          changed = JSON.stringify(fullCreatePayload(previous)) !== JSON.stringify(fullCreatePayload(item));
        } else {
          changed = followups.some((followup) => followup.type === 'update' && (
            Object.entries(followup.payload).some(([key, value]) => value !== operation.payload[key as keyof UpdateTrackedSubscriptionInput])
          ));
        }
      }
      if (changed) {
        const recovered = replaceRejectedTargetOperations(next, rejected, operation.targetId, replacement);
        if (recovered) return saveRecoveredState(userId, current, next.subscriptions, recovered);
      }
    }
  }
  writeAuthenticatedSubscriptionsState(userId, next);
  return next;
}

export function acknowledgeAuthenticatedPendingOperation(
  userId: string,
  operationId: string,
  createdSubscription?: TrackedSubscription,
): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const operation = current.pendingOperations.find((item) => item.id === operationId);
  if (!operation) return current;
  let next = current;
  if (operation.type === 'create') {
    if (!createdSubscription || createdSubscription.userId !== userId) {
      throw new Error('A matching subscription is required to acknowledge a create');
    }
    next = remapTemporaryId(current, operation.targetId, createdSubscription);
  }
  next = {
    ...next,
    pendingOperations: next.pendingOperations.filter((item) => item.id !== operationId),
    revision: nextRevision(current),
  };
  writeAuthenticatedSubscriptionsState(userId, next);
  return next;
}

function overlayPendingOperations(
  userId: string,
  serverItems: TrackedSubscription[],
  current: AuthenticatedSubscriptionsState,
): TrackedSubscription[] {
  const pendingCreateTargets = new Map(current.pendingOperations.flatMap((operation) => (
    operation.type === 'create' ? [[operation.id, operation.targetId] as const] : []
  )));
  // A committed create can appear in a list before its response is acknowledged locally.
  // Keep its optimistic row until the exact operation is acknowledged, including later edits/deletion.
  let items = serverItems.filter((item) => (
    !item.createOperationId || !pendingCreateTargets.has(item.createOperationId)
    || pendingCreateTargets.get(item.createOperationId) === item.id
  )).map((item) => ({ ...item }));
  const cached = new Map(current.subscriptions.map((item) => [item.id, item]));
  for (const operation of current.pendingOperations) {
    if (operation.type === 'create') {
      if (!items.some((item) => item.id === operation.targetId)) {
        items.push(cached.get(operation.targetId) ?? buildCreatedSubscription(
          userId, operation.payload, operation.targetId, items.length, operation.createdAt,
        ));
      }
    } else if (operation.type === 'update') {
      if (!items.some((item) => item.id === operation.targetId) && cached.has(operation.targetId)) {
        items.push(cached.get(operation.targetId)!);
      }
      items = applyUpdateToSubscriptions(items, operation.targetId, operation.payload, operation.createdAt);
    } else if (operation.type === 'delete') {
      items = items.filter((item) => item.id !== operation.targetId);
    } else {
      const positions = new Map(operation.items.map((item) => [item.id, item.position]));
      items.sort((a, b) => (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER));
    }
  }
  return normalizeSubscriptionPositions(items);
}

export function reconcileAuthenticatedSubscriptionsFromServer(
  userId: string,
  subscriptions: TrackedSubscription[],
  startedRevision: number,
): { state: AuthenticatedSubscriptionsState; accepted: boolean } {
  const current = readAuthenticatedSubscriptionsState(userId);
  if ((current.revision ?? 0) !== startedRevision) return { state: current, accepted: false };
  if (subscriptions.some((item) => item.userId !== userId)) {
    throw new Error('Subscription owner does not match the authenticated user');
  }
  const next: AuthenticatedSubscriptionsState = {
    ...current,
    subscriptions: overlayPendingOperations(userId, subscriptions, current),
    lastSyncedAt: current.pendingOperations.length ? current.lastSyncedAt : new Date().toISOString(),
  };
  writeAuthenticatedSubscriptionsState(userId, next);
  return { state: next, accepted: true };
}

export function replaceAuthenticatedSubscriptionsFromServer(
  userId: string,
  subscriptions: TrackedSubscription[],
): AuthenticatedSubscriptionsState {
  return reconcileAuthenticatedSubscriptionsFromServer(
    userId, subscriptions, readAuthenticatedSubscriptionsState(userId).revision ?? 0,
  ).state;
}

export function setAuthenticatedSyncError(userId: string, syncError: string | null): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const next = { ...current, syncError };
  writeAuthenticatedSubscriptionsState(userId, next);
  return next;
}

export function setAuthenticatedMigrationError(userId: string, migrationError: string | null): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const next = { ...current, migrationError };
  writeAuthenticatedSubscriptionsState(userId, next);
  return next;
}
