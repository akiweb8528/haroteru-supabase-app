import { beforeEach, describe, expect, it } from 'vitest';
import type { TrackedSubscription } from '@/types';
import {
  clearAuthenticatedPendingOperations,
  queueAuthenticatedCreate,
  queueAuthenticatedDelete,
  queueAuthenticatedReorder,
  queueAuthenticatedUpdate,
  readAuthenticatedSubscriptionsState,
  replaceAuthenticatedTemporaryId,
  writeAuthenticatedSubscriptionsState,
} from '@/features/subscriptions/lib/authenticated-sync-storage';

const userId = 'user-1';

function subscription(id: string, position: number): TrackedSubscription {
  return {
    id,
    userId,
    name: `Subscription ${id}`,
    amountYen: 1000 + position,
    billingCycle: 'monthly',
    category: 'video',
    reviewPriority: 'medium',
    locked: false,
    billingDay: 1,
    note: '',
    position,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

describe('authenticated-sync-storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('merges updates into an offline-created subscription', () => {
    const created = queueAuthenticatedCreate(userId, {
      name: 'Netflix',
      amountYen: 1490,
      billingCycle: 'monthly',
      reviewPriority: 'medium',
      note: '',
    });

    queueAuthenticatedUpdate(userId, created.subscription.id, {
      amountYen: 1590,
      note: 'family plan',
    });

    const state = readAuthenticatedSubscriptionsState(userId);
    expect(state.pendingOperations).toHaveLength(1);
    expect(state.pendingOperations[0]).toMatchObject({
      type: 'create',
      payload: {
        name: 'Netflix',
        amountYen: 1590,
        note: 'family plan',
      },
    });
  });

  it('removes pending create when the offline-created subscription is deleted', () => {
    const created = queueAuthenticatedCreate(userId, {
      name: 'Spotify',
      amountYen: 980,
      billingCycle: 'monthly',
      reviewPriority: 'medium',
      note: '',
    });

    queueAuthenticatedDelete(userId, created.subscription.id);

    const state = readAuthenticatedSubscriptionsState(userId);
    expect(state.pendingOperations).toHaveLength(0);
    expect(state.subscriptions).toHaveLength(0);
  });

  it('replaces temporary ids in subscriptions and queued reorder items', () => {
    writeAuthenticatedSubscriptionsState(userId, {
      subscriptions: [subscription('server-1', 0), subscription('local-auth-temp', 1)],
      pendingOperations: [
        {
          id: 'op-1',
          type: 'reorder',
          createdAt: '2024-01-01T00:00:00.000Z',
          items: [
            { id: 'server-1', position: 0 },
            { id: 'local-auth-temp', position: 1 },
          ],
        },
      ],
      syncError: null,
      lastSyncedAt: null,
    });

    replaceAuthenticatedTemporaryId(userId, 'local-auth-temp', subscription('server-2', 1));

    const state = readAuthenticatedSubscriptionsState(userId);
    expect(state.subscriptions[1]?.id).toBe('server-2');
    expect(state.pendingOperations[0]).toMatchObject({
      type: 'reorder',
      items: [
        { id: 'server-1', position: 0 },
        { id: 'server-2', position: 1 },
      ],
    });
  });

  it('keeps only the latest reorder operation', () => {
    writeAuthenticatedSubscriptionsState(userId, {
      subscriptions: [subscription('server-1', 0), subscription('server-2', 1)],
      pendingOperations: [],
      syncError: null,
      lastSyncedAt: null,
    });

    queueAuthenticatedReorder(userId, [subscription('server-2', 0), subscription('server-1', 1)]);
    queueAuthenticatedReorder(userId, [subscription('server-1', 0), subscription('server-2', 1)]);

    const state = readAuthenticatedSubscriptionsState(userId);
    expect(state.pendingOperations).toHaveLength(1);
    expect(state.pendingOperations[0]).toMatchObject({
      type: 'reorder',
      items: [
        { id: 'server-1', position: 0 },
        { id: 'server-2', position: 1 },
      ],
    });

    clearAuthenticatedPendingOperations(userId);
    expect(readAuthenticatedSubscriptionsState(userId).pendingOperations).toHaveLength(0);
  });
});
