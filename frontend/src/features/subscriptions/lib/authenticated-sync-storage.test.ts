import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateTrackedSubscriptionInput, TrackedSubscription } from '@/types';
import {
  acknowledgeAuthenticatedPendingOperation,
  AuthenticatedSubscriptionsStorageError,
  claimAuthenticatedPendingOperation,
  queueAuthenticatedCreate,
  queueAuthenticatedDelete,
  queueAuthenticatedReorder,
  queueAuthenticatedUpdate,
  readAuthenticatedSubscriptionsState,
  reconcileAuthenticatedSubscriptionsFromServer,
  rejectAuthenticatedPendingOperation,
  replaceAuthenticatedSubscriptionsFromServer,
  replaceAuthenticatedTemporaryId,
  resolveAuthenticatedSubscriptionId,
  setAuthenticatedSyncError,
  writeAuthenticatedSubscriptionsState,
} from '@/features/subscriptions/lib/authenticated-sync-storage';

const userId = 'user-1';
const input: CreateTrackedSubscriptionInput = {
  name: 'Netflix', amountYen: 1490, billingCycle: 'monthly', reviewPriority: 'medium', note: '',
};

function subscription(id: string, position = 0): TrackedSubscription {
  return {
    id, userId, name: `Subscription ${id}`, amountYen: 1000 + position,
    billingCycle: 'monthly', category: 'video', reviewPriority: 'medium', locked: false,
    billingDay: 1, note: '', position,
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function seed(items: TrackedSubscription[] = [subscription('server-1')]) {
  writeAuthenticatedSubscriptionsState(userId, {
    subscriptions: items, pendingOperations: [], syncError: null, lastSyncedAt: null,
  });
}

describe('authenticated-sync-storage data preservation', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('keeps the create payload immutable when edited during submission', () => {
    const created = queueAuthenticatedCreate(userId, input);
    const sent = created.state.pendingOperations[0];
    queueAuthenticatedUpdate(userId, created.subscription.id, { amountYen: 1590, note: 'family plan' });
    const state = readAuthenticatedSubscriptionsState(userId);
    expect(state.pendingOperations).toHaveLength(2);
    expect(state.pendingOperations[0]).toEqual(sent);
    expect(state.pendingOperations[1]).toMatchObject({ type: 'update', payload: { amountYen: 1590 } });
    expect(state.subscriptions[0]).toMatchObject({ amountYen: 1590, note: 'family plan' });
  });

  it('keeps a delete following the create that may already have reached the server', () => {
    const created = queueAuthenticatedCreate(userId, input);
    queueAuthenticatedDelete(userId, created.subscription.id);
    const state = readAuthenticatedSubscriptionsState(userId);
    expect(state.pendingOperations.map((operation) => operation.type)).toEqual(['create', 'delete']);
    expect(state.subscriptions).toEqual([]);
    replaceAuthenticatedTemporaryId(userId, created.subscription.id, subscription('server-2'));
    expect(readAuthenticatedSubscriptionsState(userId).subscriptions).toEqual([]);
  });

  it('keeps successive updates independently identifiable while the first is sending', () => {
    seed();
    const first = queueAuthenticatedUpdate(userId, 'server-1', { amountYen: 2000 }).pendingOperations[0];
    queueAuthenticatedUpdate(userId, 'server-1', { amountYen: 3000 });
    const state = readAuthenticatedSubscriptionsState(userId);
    expect(state.pendingOperations).toHaveLength(2);
    expect(state.pendingOperations[0]).toEqual(first);
    expect(state.pendingOperations[1].id).not.toBe(first.id);
    expect(state.subscriptions[0].amountYen).toBe(3000);
  });

  it('does not overwrite later edits with an older create response', () => {
    const created = queueAuthenticatedCreate(userId, input);
    queueAuthenticatedUpdate(userId, created.subscription.id, { amountYen: 1590, clearCategory: true });
    replaceAuthenticatedTemporaryId(userId, created.subscription.id, { ...subscription('server-2'), ...input });
    expect(readAuthenticatedSubscriptionsState(userId).subscriptions[0]).toMatchObject({ id: 'server-2', amountYen: 1590 });
  });

  it('does not replace a reorder already being sent when another reorder is queued', () => {
    seed([subscription('server-1'), subscription('server-2', 1)]);
    const first = queueAuthenticatedReorder(userId, [subscription('server-2'), subscription('server-1', 1)]).pendingOperations[0];
    queueAuthenticatedReorder(userId, [subscription('server-1'), subscription('server-2', 1)]);
    expect(readAuthenticatedSubscriptionsState(userId).pendingOperations).toHaveLength(2);
    expect(readAuthenticatedSubscriptionsState(userId).pendingOperations[0]).toEqual(first);
  });

  it('overlays pending changes and preserves cached records omitted by a server list', () => {
    seed([subscription('server-1'), subscription('server-2', 1)]);
    queueAuthenticatedUpdate(userId, 'server-1', { amountYen: 9999 });
    queueAuthenticatedDelete(userId, 'server-2');
    const created = queueAuthenticatedCreate(userId, input);
    replaceAuthenticatedSubscriptionsFromServer(userId, [subscription('server-2', 1), subscription('server-3', 2)]);
    const state = readAuthenticatedSubscriptionsState(userId);
    expect(state.subscriptions.find((item) => item.id === 'server-1')?.amountYen).toBe(9999);
    expect(state.subscriptions.some((item) => item.id === 'server-2')).toBe(false);
    expect(state.subscriptions.some((item) => item.id === 'server-3')).toBe(true);
    expect(state.subscriptions.some((item) => item.id === created.subscription.id)).toBe(true);
    expect(state.pendingOperations).toHaveLength(3);
  });

  it('acknowledges the exact operation after an independent operation completes first', () => {
    seed([subscription('server-1'), subscription('server-2', 1)]);
    const deleted = queueAuthenticatedDelete(userId, 'server-1').pendingOperations[0];
    queueAuthenticatedReorder(userId, [subscription('server-2')]);
    const latest = queueAuthenticatedUpdate(userId, 'server-2', { amountYen: 5000 });
    const independent = latest.pendingOperations[2];
    acknowledgeAuthenticatedPendingOperation(userId, independent.id);
    const state = acknowledgeAuthenticatedPendingOperation(userId, deleted.id);
    expect(state.pendingOperations.map((operation) => operation.type)).toEqual(['reorder']);
    expect(state.subscriptions).toEqual([expect.objectContaining({ id: 'server-2', amountYen: 5000 })]);
    const duplicate = acknowledgeAuthenticatedPendingOperation(userId, deleted.id);
    expect(duplicate).toEqual(state);
  });

  it('atomically remaps a successful create and keeps later update, reorder and delete intents', () => {
    seed();
    const created = queueAuthenticatedCreate(userId, input);
    const createId = created.state.pendingOperations[0].id;
    queueAuthenticatedUpdate(userId, created.subscription.id, { amountYen: 2990 });
    queueAuthenticatedReorder(userId, [created.subscription, subscription('server-1')]);
    queueAuthenticatedDelete(userId, created.subscription.id);
    const result = acknowledgeAuthenticatedPendingOperation(userId, createId, subscription('server-2', 1));
    expect(result.subscriptions.map((item) => item.id)).toEqual(['server-1']);
    expect(result.pendingOperations).toEqual([
      expect.objectContaining({ type: 'update', targetId: 'server-2', payload: { amountYen: 2990 } }),
      expect.objectContaining({ type: 'reorder', items: [{ id: 'server-2', position: 0 }, { id: 'server-1', position: 1 }] }),
      expect.objectContaining({ type: 'delete', targetId: 'server-2' }),
    ]);
    const merged = replaceAuthenticatedSubscriptionsFromServer(userId, [subscription('server-1'), subscription('server-2', 1)]);
    expect(merged.subscriptions.map((item) => item.id)).toEqual(['server-1']);
  });

  it('deduplicates a server row already seen before its create response arrives', () => {
    const created = queueAuthenticatedCreate(userId, input);
    queueAuthenticatedUpdate(userId, created.subscription.id, { amountYen: 9999 });
    replaceAuthenticatedSubscriptionsFromServer(userId, [subscription('server-created')]);
    const result = acknowledgeAuthenticatedPendingOperation(userId, created.state.pendingOperations[0].id, subscription('server-created'));
    expect(result.subscriptions).toEqual([expect.objectContaining({ id: 'server-created', amountYen: 9999 })]);
    expect(result.pendingOperations).toEqual([expect.objectContaining({ type: 'update', targetId: 'server-created' })]);
  });

  it('hides a concurrently fetched created row when its local item was deleted during submission', () => {
    const created = queueAuthenticatedCreate(userId, input);
    queueAuthenticatedDelete(userId, created.subscription.id);
    replaceAuthenticatedSubscriptionsFromServer(userId, [subscription('server-created')]);
    const result = acknowledgeAuthenticatedPendingOperation(userId, created.state.pendingOperations[0].id, subscription('server-created'));
    expect(result.subscriptions).toEqual([]);
    expect(result.pendingOperations).toEqual([expect.objectContaining({ type: 'delete', targetId: 'server-created' })]);
  });

  it('shows one optimistic row when a list identifies a pending create whose success response was lost', () => {
    const created = queueAuthenticatedCreate(userId, input);
    const operationId = created.state.pendingOperations[0].id;
    claimAuthenticatedPendingOperation(userId, operationId);
    setAuthenticatedSyncError(userId, 'lost success response');
    const canonical = { ...subscription('server-created'), ...input, createOperationId: operationId };
    const before = readAuthenticatedSubscriptionsState(userId).pendingOperations;
    const result = replaceAuthenticatedSubscriptionsFromServer(userId, [canonical]);
    expect(result.subscriptions).toEqual([expect.objectContaining({ id: created.subscription.id, amountYen: input.amountYen })]);
    expect(result.pendingOperations).toEqual(before);
    expect(result.syncError).toBe('lost success response');
  });

  it('keeps a later edit on the sole optimistic row while the matching create has no acknowledgement', () => {
    const created = queueAuthenticatedCreate(userId, input);
    const operationId = created.state.pendingOperations[0].id;
    queueAuthenticatedUpdate(userId, created.subscription.id, { amountYen: 2990, note: 'later edit' });
    const canonical = { ...subscription('server-created'), ...input, createOperationId: operationId };
    const before = readAuthenticatedSubscriptionsState(userId).pendingOperations;
    const result = replaceAuthenticatedSubscriptionsFromServer(userId, [canonical]);
    expect(result.subscriptions).toEqual([expect.objectContaining({ id: created.subscription.id, amountYen: 2990, note: 'later edit' })]);
    expect(result.subscriptions.reduce((total, item) => total + item.amountYen, 0)).toBe(2990);
    expect(result.pendingOperations).toEqual(before);
  });

  it('keeps a deleted optimistic create hidden when a list identifies its already committed server row', () => {
    const created = queueAuthenticatedCreate(userId, input);
    const operationId = created.state.pendingOperations[0].id;
    queueAuthenticatedDelete(userId, created.subscription.id);
    const canonical = { ...subscription('server-created'), ...input, createOperationId: operationId };
    const before = readAuthenticatedSubscriptionsState(userId).pendingOperations;
    const result = replaceAuthenticatedSubscriptionsFromServer(userId, [canonical]);
    expect(result.subscriptions).toEqual([]);
    expect(result.pendingOperations).toEqual(before);
    expect(result.temporaryIdMap).toEqual({});
  });

  it('retains an identical subscription belonging to a different create operation', () => {
    const created = queueAuthenticatedCreate(userId, input);
    const otherCanonical = { ...subscription('unrelated-server-row'), ...input, createOperationId: 'different-operation' };
    const result = replaceAuthenticatedSubscriptionsFromServer(userId, [otherCanonical]);
    expect(result.subscriptions.map((item) => item.id)).toEqual(['unrelated-server-row', created.subscription.id]);
    expect(result.pendingOperations).toHaveLength(1);
  });

  it('retains the canonical row after acknowledgement of the operation that identifies it', () => {
    const created = queueAuthenticatedCreate(userId, input);
    const operationId = created.state.pendingOperations[0].id;
    const canonical = { ...subscription('server-created'), ...input, createOperationId: operationId };
    replaceAuthenticatedSubscriptionsFromServer(userId, [canonical]);
    const acknowledged = acknowledgeAuthenticatedPendingOperation(userId, operationId, canonical);
    expect(acknowledged.subscriptions).toEqual([expect.objectContaining({ id: canonical.id, createOperationId: operationId })]);
    const refreshed = replaceAuthenticatedSubscriptionsFromServer(userId, [canonical]);
    expect(refreshed.subscriptions).toEqual([expect.objectContaining({ id: canonical.id, createOperationId: operationId })]);
  });

  it('resolves a temporary id still held by an editor after create acknowledgement', () => {
    const created = queueAuthenticatedCreate(userId, input);
    acknowledgeAuthenticatedPendingOperation(userId, created.state.pendingOperations[0].id, subscription('server-1'));
    const updated = queueAuthenticatedUpdate(userId, created.subscription.id, { note: 'saved after response' });
    expect(resolveAuthenticatedSubscriptionId(updated, created.subscription.id)).toBe('server-1');
    expect(updated.subscriptions[0].note).toBe('saved after response');
    expect(updated.pendingOperations[0]).toMatchObject({ type: 'update', targetId: 'server-1' });
    expect(queueAuthenticatedDelete(userId, created.subscription.id).subscriptions).toEqual([]);
  });

  it('persists claim identity and payload across a lost response and reload', () => {
    const created = queueAuthenticatedCreate(userId, input);
    const operationId = created.state.pendingOperations[0].id;
    const first = claimAuthenticatedPendingOperation(userId, operationId);
    expect(first).toMatchObject({ id: operationId, attemptCount: 1, payload: input });
    expect(readAuthenticatedSubscriptionsState(userId).pendingOperations[0]).toEqual(first);
    const second = claimAuthenticatedPendingOperation(userId, operationId);
    expect(second).toMatchObject({ id: operationId, attemptCount: 2, payload: input });
    expect(second?.lastAttemptAt).toEqual(expect.any(String));
    expect(claimAuthenticatedPendingOperation(userId, 'missing-operation')).toBeNull();
    expect(readAuthenticatedSubscriptionsState(userId).subscriptions[0].id).toBe(created.subscription.id);
  });

  it('does not acknowledge a create when its owner or response is missing', () => {
    const created = queueAuthenticatedCreate(userId, input);
    const operationId = created.state.pendingOperations[0].id;
    expect(() => acknowledgeAuthenticatedPendingOperation(userId, operationId)).toThrow();
    expect(() => acknowledgeAuthenticatedPendingOperation(userId, operationId, { ...subscription('foreign'), userId: 'user-2' })).toThrow();
    expect(readAuthenticatedSubscriptionsState(userId)).toEqual(created.state);
  });

  it('rejects a list snapshot started before a local edit even after that edit is acknowledged', () => {
    seed();
    const fetchRevision = readAuthenticatedSubscriptionsState(userId).revision ?? 0;
    const edited = queueAuthenticatedUpdate(userId, 'server-1', { amountYen: 9999 });
    acknowledgeAuthenticatedPendingOperation(userId, edited.pendingOperations[0].id);
    const result = reconcileAuthenticatedSubscriptionsFromServer(userId, [subscription('server-1')], fetchRevision);
    expect(result.accepted).toBe(false);
    expect(result.state.subscriptions[0].amountYen).toBe(9999);
    expect(result.state.pendingOperations).toEqual([]);
  });

  it('accepts a fresh snapshot with pending overlays without clearing a sync error', () => {
    seed();
    const edited = queueAuthenticatedUpdate(userId, 'server-1', { amountYen: 9999 });
    setAuthenticatedSyncError(userId, 'connection lost');
    const claimed = claimAuthenticatedPendingOperation(userId, edited.pendingOperations[0].id);
    const result = reconcileAuthenticatedSubscriptionsFromServer(userId, [subscription('server-1')], edited.revision ?? 0);
    expect(result.accepted).toBe(true);
    expect(result.state.syncError).toBe('connection lost');
    expect(result.state.pendingOperations[0]).toEqual(claimed);
    expect(result.state.subscriptions[0].amountYen).toBe(9999);
  });

  it('loads legacy v1 records and operation ids without clearing another user', () => {
    const legacy = {
      subscriptions: [subscription('local-auth-legacy')],
      pendingOperations: [{ id: 'legacy-op', type: 'create', targetId: 'local-auth-legacy', payload: input, createdAt: '2024-01-01T00:00:00.000Z' }],
      syncError: 'old network error', lastSyncedAt: null,
    };
    const other = { ...legacy, subscriptions: [{ ...subscription('other-local'), userId: 'user-2' }], pendingOperations: [] };
    localStorage.setItem('authenticated_subscriptions_sync_v1', JSON.stringify({ [userId]: legacy, 'user-2': other }));
    const loaded = readAuthenticatedSubscriptionsState(userId);
    expect(loaded.pendingOperations[0].id).toBe('legacy-op');
    expect(loaded.revision).toBe(0);
    expect(loaded.subscriptions).toEqual(legacy.subscriptions);
    queueAuthenticatedUpdate(userId, 'local-auth-legacy', { amountYen: 1234 });
    expect(readAuthenticatedSubscriptionsState('user-2').subscriptions).toEqual(other.subscriptions);
    expect(readAuthenticatedSubscriptionsState('new-user').subscriptions).toEqual([]);
    const raw = JSON.parse(localStorage.getItem('authenticated_subscriptions_sync_v1')!);
    expect(raw['user-2']).toEqual(other);
    expect(raw[userId].pendingOperations[0]).toEqual(legacy.pendingOperations[0]);
  });

  it('reconstructs a legacy queued create missing from the cache and replays field clears', () => {
    writeAuthenticatedSubscriptionsState(userId, {
      subscriptions: [],
      pendingOperations: [
        { id: 'create', type: 'create', targetId: 'local-auth-missing', payload: { ...input, category: 'video', billingDay: 5 }, createdAt: '2024-01-01T00:00:00.000Z' },
        { id: 'update-1', type: 'update', targetId: 'local-auth-missing', payload: { clearCategory: true, clearBillingDay: true }, createdAt: '2024-01-02T00:00:00.000Z' },
        { id: 'update-2', type: 'update', targetId: 'local-auth-missing', payload: { category: 'music', billingDay: 10 }, createdAt: '2024-01-03T00:00:00.000Z' },
      ], syncError: null, lastSyncedAt: null,
    });
    const result = replaceAuthenticatedSubscriptionsFromServer(userId, []);
    expect(result.subscriptions[0]).toMatchObject({ name: input.name, category: 'music', billingDay: 10 });
    expect(result.pendingOperations).toHaveLength(3);
  });

  it('does not resurrect a deleted row or discard a new row from a stale drag snapshot', () => {
    const stale = [subscription('server-1'), subscription('server-2', 1)];
    seed(stale);
    queueAuthenticatedDelete(userId, 'server-1');
    const created = queueAuthenticatedCreate(userId, input);
    const state = queueAuthenticatedReorder(userId, stale);
    expect(state.subscriptions.map((item) => item.id)).toEqual(['server-2', created.subscription.id]);
    expect(state.pendingOperations[0]).toMatchObject({ type: 'delete', targetId: 'server-1' });
  });

  it('rejects a server response belonging to another account without changing saved data', () => {
    seed();
    const original = localStorage.getItem('authenticated_subscriptions_sync_v1');
    expect(() => replaceAuthenticatedSubscriptionsFromServer(userId, [{ ...subscription('foreign'), userId: 'user-2' }])).toThrow();
    expect(localStorage.getItem('authenticated_subscriptions_sync_v1')).toBe(original);
  });

  it('does not claim success or dispatch a saved event when browser writes fail', () => {
    seed();
    const original = localStorage.getItem('authenticated_subscriptions_sync_v1');
    const listener = vi.fn();
    window.addEventListener('authenticated-subscriptions-updated', listener);
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(() => queueAuthenticatedCreate(userId, input)).toThrow(AuthenticatedSubscriptionsStorageError);
    expect(listener).not.toHaveBeenCalled();
    write.mockRestore();
    window.removeEventListener('authenticated-subscriptions-updated', listener);
    expect(localStorage.getItem('authenticated_subscriptions_sync_v1')).toBe(original);
  });

  it('retains the operation when persisting its completion fails', () => {
    const created = queueAuthenticatedCreate(userId, input);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disk denied'); });
    expect(() => acknowledgeAuthenticatedPendingOperation(userId, created.state.pendingOperations[0].id, subscription('server-1'))).toThrow(AuthenticatedSubscriptionsStorageError);
    expect(readAuthenticatedSubscriptionsState(userId).pendingOperations[0].id).toBe(created.state.pendingOperations[0].id);
  });

  it('never overwrites unreadable saved data with a new empty state', () => {
    localStorage.setItem('authenticated_subscriptions_sync_v1', '{partially damaged data');
    expect(() => readAuthenticatedSubscriptionsState(userId)).toThrow(AuthenticatedSubscriptionsStorageError);
    expect(() => queueAuthenticatedCreate(userId, input)).toThrow(AuthenticatedSubscriptionsStorageError);
    expect(localStorage.getItem('authenticated_subscriptions_sync_v1')).toBe('{partially damaged data');
  });

  it('keeps user-like object property names isolated instead of reading prototypes', () => {
    expect(readAuthenticatedSubscriptionsState('__proto__').subscriptions).toEqual([]);
    queueAuthenticatedCreate('__proto__', input);
    expect(readAuthenticatedSubscriptionsState('__proto__').subscriptions[0].userId).toBe('__proto__');
    expect(readAuthenticatedSubscriptionsState(userId).subscriptions).toEqual([]);
  });

  it('replaces a definitively rejected create with a new id containing subsequent corrected edits', () => {
    const created = queueAuthenticatedCreate(userId, { ...input, amountYen: -1 });
    const operationId = created.state.pendingOperations[0].id;
    const stored = readAuthenticatedSubscriptionsState(userId);
    Object.assign(stored.pendingOperations[0], { attemptCount: 1, definitivelyRejected: true });
    writeAuthenticatedSubscriptionsState(userId, stored);
    const recovered = queueAuthenticatedUpdate(userId, created.subscription.id, { amountYen: 2500, clearCategory: true });
    expect(recovered.pendingOperations).toHaveLength(1);
    expect(recovered.pendingOperations[0]).toMatchObject({ type: 'create', targetId: created.subscription.id, payload: { amountYen: 2500 } });
    expect(recovered.pendingOperations[0].id).not.toBe(operationId);
    expect(recovered.pendingOperations[0].attemptCount ?? 0).toBe(0);
  });

  it('cancels only a definitively rejected create when deleted and repairs unattempted reorders', () => {
    seed();
    const created = queueAuthenticatedCreate(userId, input);
    queueAuthenticatedReorder(userId, [created.subscription, subscription('server-1')]);
    const stored = readAuthenticatedSubscriptionsState(userId);
    Object.assign(stored.pendingOperations[0], { attemptCount: 1, definitivelyRejected: true });
    writeAuthenticatedSubscriptionsState(userId, stored);
    const removed = queueAuthenticatedDelete(userId, created.subscription.id);
    expect(removed.subscriptions.map((item) => item.id)).toEqual(['server-1']);
    expect(removed.pendingOperations).toEqual([expect.objectContaining({ type: 'reorder', items: [{ id: 'server-1', position: 0 }] })]);
  });

  it('replaces a rejected update and unsent dependent edits with all current corrected values', () => {
    seed();
    const first = queueAuthenticatedUpdate(userId, 'server-1', { amountYen: -1 });
    queueAuthenticatedUpdate(userId, 'server-1', { note: 'keep this pending note', clearCategory: true });
    const stored = readAuthenticatedSubscriptionsState(userId);
    Object.assign(stored.pendingOperations[0], { attemptCount: 1, definitivelyRejected: true });
    writeAuthenticatedSubscriptionsState(userId, stored);
    const corrected = queueAuthenticatedUpdate(userId, 'server-1', { amountYen: 3000 });
    expect(corrected.pendingOperations).toHaveLength(1);
    expect(corrected.pendingOperations[0].id).not.toBe(first.pendingOperations[0].id);
    expect(corrected.pendingOperations[0]).toMatchObject({ type: 'update', payload: { amountYen: 3000, note: 'keep this pending note', clearCategory: true } });
  });

  it('allows a deletion to supersede a rejected update without discarding uncertain operations', () => {
    seed();
    queueAuthenticatedUpdate(userId, 'server-1', { amountYen: -1 });
    const stored = readAuthenticatedSubscriptionsState(userId);
    Object.assign(stored.pendingOperations[0], { attemptCount: 1, definitivelyRejected: true });
    writeAuthenticatedSubscriptionsState(userId, stored);
    const removed = queueAuthenticatedDelete(userId, 'server-1');
    expect(removed.pendingOperations.map((operation) => operation.type)).toEqual(['delete']);
    expect(removed.subscriptions).toEqual([]);
  });

  it('preserves an uncertain attempted create and its immutable payload when corrected or deleted', () => {
    const created = queueAuthenticatedCreate(userId, input);
    claimAuthenticatedPendingOperation(userId, created.state.pendingOperations[0].id);
    const before = readAuthenticatedSubscriptionsState(userId).pendingOperations[0];
    queueAuthenticatedUpdate(userId, created.subscription.id, { amountYen: 8000 });
    const removed = queueAuthenticatedDelete(userId, created.subscription.id);
    expect(removed.pendingOperations[0]).toEqual(before);
    expect(removed.pendingOperations.map((operation) => operation.type)).toEqual(['create', 'update', 'delete']);
  });

  it('supersedes a definitively rejected reorder with a new user reorder', () => {
    seed([subscription('server-1'), subscription('server-2', 1)]);
    const first = queueAuthenticatedReorder(userId, [subscription('server-2'), subscription('server-1', 1)]);
    const stored = readAuthenticatedSubscriptionsState(userId);
    Object.assign(stored.pendingOperations[0], { attemptCount: 1, definitivelyRejected: true });
    writeAuthenticatedSubscriptionsState(userId, stored);
    const corrected = queueAuthenticatedReorder(userId, [subscription('server-1'), subscription('server-2', 1)]);
    expect(corrected.pendingOperations).toHaveLength(1);
    expect(corrected.pendingOperations[0].id).not.toBe(first.pendingOperations[0].id);
  });

  it('persists a definitive rejection but clears it durably before a new request is sent', () => {
    const created = queueAuthenticatedCreate(userId, input);
    const operationId = created.state.pendingOperations[0].id;
    claimAuthenticatedPendingOperation(userId, operationId);
    rejectAuthenticatedPendingOperation(userId, operationId, 'validation failed');
    expect(readAuthenticatedSubscriptionsState(userId).pendingOperations[0]).toMatchObject({
      definitivelyRejected: true, rejectionReason: 'validation failed',
    });
    claimAuthenticatedPendingOperation(userId, operationId);
    const retried = readAuthenticatedSubscriptionsState(userId).pendingOperations[0];
    expect(retried.definitivelyRejected).toBeUndefined();
    expect(retried.rejectionReason).toBeUndefined();
    const edited = queueAuthenticatedUpdate(userId, created.subscription.id, { amountYen: 3000 });
    expect(edited.pendingOperations[0]).toEqual(retried);
    expect(edited.pendingOperations).toHaveLength(2);
  });

  it('never discards an uncertain dependent operation when recovering a rejected update', () => {
    seed();
    const first = queueAuthenticatedUpdate(userId, 'server-1', { amountYen: 2000 });
    queueAuthenticatedUpdate(userId, 'server-1', { note: 'possibly applied already' });
    const current = readAuthenticatedSubscriptionsState(userId);
    claimAuthenticatedPendingOperation(userId, current.pendingOperations[1].id);
    rejectAuthenticatedPendingOperation(userId, first.pendingOperations[0].id);
    const before = readAuthenticatedSubscriptionsState(userId);
    const corrected = queueAuthenticatedUpdate(userId, 'server-1', { amountYen: 3000 });
    expect(corrected.pendingOperations.slice(0, 2)).toEqual(before.pendingOperations);
    expect(corrected.pendingOperations).toHaveLength(3);
  });

  it('preserves an independent queued operation when repairing a rejected create', () => {
    seed();
    const created = queueAuthenticatedCreate(userId, input);
    queueAuthenticatedUpdate(userId, 'server-1', { note: 'independent change' });
    rejectAuthenticatedPendingOperation(userId, created.state.pendingOperations[0].id);
    const before = readAuthenticatedSubscriptionsState(userId).pendingOperations[1];
    const corrected = queueAuthenticatedUpdate(userId, created.subscription.id, { amountYen: 3000 });
    expect(corrected.pendingOperations[1]).toEqual(before);
    expect(corrected.subscriptions.find((item) => item.id === 'server-1')?.note).toBe('independent change');
  });

  it('does not save a hidden update for a row already deleted locally', () => {
    seed();
    const before = queueAuthenticatedDelete(userId, 'server-1');
    expect(() => queueAuthenticatedUpdate(userId, 'server-1', { name: 'stale editor' })).toThrow();
    expect(readAuthenticatedSubscriptionsState(userId)).toEqual(before);
  });

  it('automatically recovers a corrected edit already queued while the rejected create was sending', () => {
    const created = queueAuthenticatedCreate(userId, { ...input, amountYen: -1 });
    const originalId = created.state.pendingOperations[0].id;
    claimAuthenticatedPendingOperation(userId, originalId);
    queueAuthenticatedUpdate(userId, created.subscription.id, { amountYen: 5000, note: 'preserved correction' });
    const rejected = rejectAuthenticatedPendingOperation(userId, originalId, 'invalid amount');
    expect(rejected.pendingOperations).toEqual([expect.objectContaining({ type: 'create', payload: expect.objectContaining({ amountYen: 5000, note: 'preserved correction' }) })]);
    expect(rejected.pendingOperations[0].id).not.toBe(originalId);
    rejectAuthenticatedPendingOperation(userId, rejected.pendingOperations[0].id, 'another constraint');
    expect(readAuthenticatedSubscriptionsState(userId).pendingOperations[0].id).toBe(rejected.pendingOperations[0].id);
  });

  it('automatically cancels a rejected create already deleted during its request', () => {
    const created = queueAuthenticatedCreate(userId, input);
    const originalId = created.state.pendingOperations[0].id;
    claimAuthenticatedPendingOperation(userId, originalId);
    queueAuthenticatedDelete(userId, created.subscription.id);
    const result = rejectAuthenticatedPendingOperation(userId, originalId);
    expect(result.subscriptions).toEqual([]);
    expect(result.pendingOperations).toEqual([]);
  });

  it('automatically replaces a rejected update with a later correction or deletion', () => {
    seed();
    const first = queueAuthenticatedUpdate(userId, 'server-1', { amountYen: -1 });
    queueAuthenticatedUpdate(userId, 'server-1', { amountYen: 6000 });
    const corrected = rejectAuthenticatedPendingOperation(userId, first.pendingOperations[0].id);
    expect(corrected.pendingOperations).toEqual([expect.objectContaining({ type: 'update', payload: expect.objectContaining({ amountYen: 6000 }) })]);
    queueAuthenticatedDelete(userId, 'server-1');
    const removed = rejectAuthenticatedPendingOperation(userId, corrected.pendingOperations[0].id);
    expect(removed.pendingOperations.map((item) => item.type)).toEqual(['delete']);
  });

  it('does not mint fresh operation ids for a queued edit that leaves the rejected payload unchanged', () => {
    const created = queueAuthenticatedCreate(userId, input);
    queueAuthenticatedUpdate(userId, created.subscription.id, { amountYen: input.amountYen });
    const rejected = rejectAuthenticatedPendingOperation(userId, created.state.pendingOperations[0].id);
    expect(rejected.pendingOperations).toHaveLength(2);
    expect(rejected.pendingOperations[0].id).toBe(created.state.pendingOperations[0].id);
    expect(rejected.pendingOperations[0].definitivelyRejected).toBe(true);
  });
});
