'use client';

import type {
  CreateTrackedSubscriptionInput,
  TrackedSubscription,
  UpdateTrackedSubscriptionInput,
} from '@/types';

export const AUTHENTICATED_SUBSCRIPTIONS_UPDATED_EVENT = 'authenticated-subscriptions-updated';

const AUTHENTICATED_SUBSCRIPTIONS_STORAGE_KEY = 'authenticated_subscriptions_sync_v1';
const TEMP_SUBSCRIPTION_ID_PREFIX = 'local-auth-';

type AuthenticatedSubscriptionsStorageShape = Record<string, AuthenticatedSubscriptionsState>;

export type PendingSubscriptionOperation =
  | {
      id: string;
      type: 'create';
      targetId: string;
      payload: CreateTrackedSubscriptionInput;
      createdAt: string;
    }
  | {
      id: string;
      type: 'update';
      targetId: string;
      payload: UpdateTrackedSubscriptionInput;
      createdAt: string;
    }
  | {
      id: string;
      type: 'delete';
      targetId: string;
      createdAt: string;
    }
  | {
      id: string;
      type: 'reorder';
      items: { id: string; position: number }[];
      createdAt: string;
    };

export interface AuthenticatedSubscriptionsState {
  subscriptions: TrackedSubscription[];
  pendingOperations: PendingSubscriptionOperation[];
  syncError: string | null;
  lastSyncedAt: string | null;
}

function dispatchAuthenticatedSubscriptionsUpdated() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(AUTHENTICATED_SUBSCRIPTIONS_UPDATED_EVENT));
}

function readStorage(): AuthenticatedSubscriptionsStorageShape {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = localStorage.getItem(AUTHENTICATED_SUBSCRIPTIONS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as AuthenticatedSubscriptionsStorageShape;
  } catch {
    return {};
  }
}

function writeStorage(next: AuthenticatedSubscriptionsStorageShape) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(AUTHENTICATED_SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(next));
    dispatchAuthenticatedSubscriptionsUpdated();
  } catch {}
}

export function emptyAuthenticatedSubscriptionsState(): AuthenticatedSubscriptionsState {
  return {
    subscriptions: [],
    pendingOperations: [],
    syncError: null,
    lastSyncedAt: null,
  };
}

export function isTemporarySubscriptionId(id: string): boolean {
  return id.startsWith(TEMP_SUBSCRIPTION_ID_PREFIX);
}

function buildOperationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildTemporarySubscriptionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${TEMP_SUBSCRIPTION_ID_PREFIX}${crypto.randomUUID()}`;
  }

  return `${TEMP_SUBSCRIPTION_ID_PREFIX}${buildOperationId()}`;
}

function normalizeSubscriptionPositions(items: TrackedSubscription[]): TrackedSubscription[] {
  return items.map((item, index) => ({
    ...item,
    position: index,
  }));
}

function replaceSubscriptionId(items: TrackedSubscription[], fromId: string, toItem: TrackedSubscription): TrackedSubscription[] {
  return normalizeSubscriptionPositions(items.map((item) => {
    if (item.id !== fromId) {
      return item;
    }

    return {
      ...item,
      ...toItem,
      id: toItem.id,
      userId: toItem.userId,
      createdAt: toItem.createdAt,
      updatedAt: toItem.updatedAt,
    };
  }));
}

function replacePendingTargetId(
  operations: PendingSubscriptionOperation[],
  fromId: string,
  toId: string,
): PendingSubscriptionOperation[] {
  return operations.map((operation) => {
    if (operation.type === 'reorder') {
      return {
        ...operation,
        items: operation.items.map((item) => (
          item.id === fromId
            ? { ...item, id: toId }
            : item
        )),
      };
    }

    if (operation.targetId !== fromId) {
      return operation;
    }

    return {
      ...operation,
      targetId: toId,
    };
  });
}

function mergeUpdatePayload(current: UpdateTrackedSubscriptionInput, next: UpdateTrackedSubscriptionInput): UpdateTrackedSubscriptionInput {
  return {
    ...current,
    ...next,
    clearCategory: next.clearCategory ?? current.clearCategory,
    clearBillingDay: next.clearBillingDay ?? current.clearBillingDay,
  };
}

function buildCreatedSubscription(
  userId: string,
  input: CreateTrackedSubscriptionInput,
  current: TrackedSubscription[],
): TrackedSubscription {
  const now = new Date().toISOString();
  return {
    id: buildTemporarySubscriptionId(),
    userId,
    name: input.name,
    amountYen: input.amountYen,
    billingCycle: input.billingCycle,
    category: input.category,
    reviewPriority: input.reviewPriority,
    locked: input.locked ?? false,
    billingDay: input.billingDay,
    note: input.note ?? '',
    position: current.length,
    createdAt: now,
    updatedAt: now,
  };
}

function applyUpdateToSubscriptions(
  items: TrackedSubscription[],
  id: string,
  input: UpdateTrackedSubscriptionInput,
): TrackedSubscription[] {
  return items.map((item) => {
    if (item.id !== id) {
      return item;
    }

    return {
      ...item,
      ...input,
      category: input.clearCategory ? undefined : (input.category !== undefined ? input.category : item.category),
      billingDay: input.clearBillingDay ? undefined : (input.billingDay !== undefined ? input.billingDay : item.billingDay),
      note: input.note !== undefined ? input.note : item.note,
      updatedAt: new Date().toISOString(),
    };
  });
}

export function readAuthenticatedSubscriptionsState(userId: string): AuthenticatedSubscriptionsState {
  const state = readStorage()[userId];
  return state ?? emptyAuthenticatedSubscriptionsState();
}

export function writeAuthenticatedSubscriptionsState(userId: string, state: AuthenticatedSubscriptionsState) {
  const all = readStorage();
  all[userId] = state;
  writeStorage(all);
}

export function queueAuthenticatedCreate(
  userId: string,
  input: CreateTrackedSubscriptionInput,
): { state: AuthenticatedSubscriptionsState; subscription: TrackedSubscription } {
  const current = readAuthenticatedSubscriptionsState(userId);
  const subscription = buildCreatedSubscription(userId, input, current.subscriptions);
  const nextState: AuthenticatedSubscriptionsState = {
    ...current,
    subscriptions: normalizeSubscriptionPositions([...current.subscriptions, subscription]),
    pendingOperations: [
      ...current.pendingOperations,
      {
        id: buildOperationId(),
        type: 'create',
        targetId: subscription.id,
        payload: input,
        createdAt: new Date().toISOString(),
      },
    ],
    syncError: null,
  };

  writeAuthenticatedSubscriptionsState(userId, nextState);
  return { state: nextState, subscription };
}

export function queueAuthenticatedUpdate(
  userId: string,
  id: string,
  input: UpdateTrackedSubscriptionInput,
): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const subscriptions = applyUpdateToSubscriptions(current.subscriptions, id, input);

  const pendingOperations = [...current.pendingOperations];
  const createIndex = pendingOperations.findIndex((operation) => operation.type === 'create' && operation.targetId === id);
  if (createIndex >= 0) {
    const createOperation = pendingOperations[createIndex];
    if (createOperation.type === 'create') {
      pendingOperations[createIndex] = {
        ...createOperation,
        payload: {
          ...createOperation.payload,
          name: input.name ?? createOperation.payload.name,
          amountYen: input.amountYen ?? createOperation.payload.amountYen,
          billingCycle: input.billingCycle ?? createOperation.payload.billingCycle,
          category: input.clearCategory ? undefined : (input.category !== undefined ? input.category : createOperation.payload.category),
          reviewPriority: input.reviewPriority ?? createOperation.payload.reviewPriority,
          locked: input.locked ?? createOperation.payload.locked,
          billingDay: input.clearBillingDay ? undefined : (input.billingDay !== undefined ? input.billingDay : createOperation.payload.billingDay),
          note: input.note !== undefined ? input.note : createOperation.payload.note,
        },
      };
    }
  } else {
    const updateIndex = pendingOperations.findIndex((operation) => operation.type === 'update' && operation.targetId === id);
    if (updateIndex >= 0) {
      const updateOperation = pendingOperations[updateIndex];
      if (updateOperation.type === 'update') {
        pendingOperations[updateIndex] = {
          ...updateOperation,
          payload: mergeUpdatePayload(updateOperation.payload, input),
        };
      }
    } else {
      pendingOperations.push({
        id: buildOperationId(),
        type: 'update',
        targetId: id,
        payload: input,
        createdAt: new Date().toISOString(),
      });
    }
  }

  const nextState: AuthenticatedSubscriptionsState = {
    ...current,
    subscriptions,
    pendingOperations,
    syncError: null,
  };

  writeAuthenticatedSubscriptionsState(userId, nextState);
  return nextState;
}

export function queueAuthenticatedDelete(userId: string, id: string): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const subscriptions = normalizeSubscriptionPositions(current.subscriptions.filter((item) => item.id !== id));
  let pendingOperations = current.pendingOperations.filter((operation) => {
    if (operation.type === 'reorder') {
      return true;
    }
    return operation.targetId !== id;
  });

  const hadOfflineCreate = current.pendingOperations.some((operation) => operation.type === 'create' && operation.targetId === id);
  if (!hadOfflineCreate) {
    const alreadyQueued = pendingOperations.some((operation) => operation.type === 'delete' && operation.targetId === id);
    if (!alreadyQueued) {
      pendingOperations.push({
        id: buildOperationId(),
        type: 'delete',
        targetId: id,
        createdAt: new Date().toISOString(),
      });
    }
  }

  pendingOperations = pendingOperations.map((operation) => {
    if (operation.type !== 'reorder') {
      return operation;
    }

    return {
      ...operation,
      items: operation.items
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, position: index })),
    };
  });

  const nextState: AuthenticatedSubscriptionsState = {
    ...current,
    subscriptions,
    pendingOperations,
    syncError: null,
  };

  writeAuthenticatedSubscriptionsState(userId, nextState);
  return nextState;
}

export function queueAuthenticatedReorder(
  userId: string,
  subscriptions: TrackedSubscription[],
): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const normalized = normalizeSubscriptionPositions(subscriptions);
  const reorderOperation: PendingSubscriptionOperation = {
    id: buildOperationId(),
    type: 'reorder',
    items: normalized.map((item) => ({ id: item.id, position: item.position })),
    createdAt: new Date().toISOString(),
  };

  const nextState: AuthenticatedSubscriptionsState = {
    ...current,
    subscriptions: normalized,
    pendingOperations: [
      ...current.pendingOperations.filter((operation) => operation.type !== 'reorder'),
      reorderOperation,
    ],
    syncError: null,
  };

  writeAuthenticatedSubscriptionsState(userId, nextState);
  return nextState;
}

export function replaceAuthenticatedTemporaryId(
  userId: string,
  fromId: string,
  toItem: TrackedSubscription,
): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const nextState: AuthenticatedSubscriptionsState = {
    ...current,
    subscriptions: replaceSubscriptionId(current.subscriptions, fromId, toItem),
    pendingOperations: replacePendingTargetId(current.pendingOperations, fromId, toItem.id),
  };

  writeAuthenticatedSubscriptionsState(userId, nextState);
  return nextState;
}

export function shiftAuthenticatedPendingOperation(userId: string): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const nextState: AuthenticatedSubscriptionsState = {
    ...current,
    pendingOperations: current.pendingOperations.slice(1),
  };

  writeAuthenticatedSubscriptionsState(userId, nextState);
  return nextState;
}

export function replaceAuthenticatedSubscriptionsFromServer(
  userId: string,
  subscriptions: TrackedSubscription[],
): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const nextState: AuthenticatedSubscriptionsState = {
    ...current,
    subscriptions: normalizeSubscriptionPositions(subscriptions),
    syncError: null,
    lastSyncedAt: new Date().toISOString(),
  };

  writeAuthenticatedSubscriptionsState(userId, nextState);
  return nextState;
}

export function setAuthenticatedSyncError(userId: string, syncError: string | null): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const nextState: AuthenticatedSubscriptionsState = {
    ...current,
    syncError,
  };

  writeAuthenticatedSubscriptionsState(userId, nextState);
  return nextState;
}

export function clearAuthenticatedPendingOperations(userId: string): AuthenticatedSubscriptionsState {
  const current = readAuthenticatedSubscriptionsState(userId);
  const nextState: AuthenticatedSubscriptionsState = {
    ...current,
    pendingOperations: [],
    syncError: null,
    lastSyncedAt: new Date().toISOString(),
  };

  writeAuthenticatedSubscriptionsState(userId, nextState);
  return nextState;
}
