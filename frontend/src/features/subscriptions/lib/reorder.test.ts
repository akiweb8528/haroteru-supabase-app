import { describe, expect, it } from 'vitest';
import type { TrackedSubscription } from '@/types';
import { buildReorderPayload, reorderSubscriptionsWithHiddenItems } from './reorder';

function subscription(id: string, position: number): TrackedSubscription {
  return {
    id,
    userId: 'user-1',
    name: id,
    amountYen: 1000,
    billingCycle: 'monthly',
    category: 'other',
    reviewPriority: 'medium',
    locked: false,
    note: '',
    position,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

describe('reorderSubscriptionsWithHiddenItems', () => {
  it('downward move inserts after target and before hidden items below it', () => {
    const all = [
      subscription('a', 0),
      subscription('b', 1),
      subscription('hidden-1', 2),
      subscription('hidden-2', 3),
      subscription('c', 4),
    ];
    const visible = [all[0], all[1], all[4]];

    const next = reorderSubscriptionsWithHiddenItems(all, visible, 'a', 'b');

    expect(next.map((item) => item.id)).toEqual(['b', 'a', 'hidden-1', 'hidden-2', 'c']);
  });

  it('upward move inserts before target and after hidden items above it', () => {
    const all = [
      subscription('a', 0),
      subscription('hidden-1', 1),
      subscription('hidden-2', 2),
      subscription('b', 3),
      subscription('c', 4),
    ];
    const visible = [all[0], all[3], all[4]];

    const next = reorderSubscriptionsWithHiddenItems(all, visible, 'c', 'b');

    expect(next.map((item) => item.id)).toEqual(['a', 'hidden-1', 'hidden-2', 'c', 'b']);
  });

  it('reassigns positions sequentially after reorder', () => {
    const all = [subscription('a', 10), subscription('b', 20), subscription('c', 30)];

    const next = reorderSubscriptionsWithHiddenItems(all, all, 'c', 'a');

    expect(next.map((item) => item.position)).toEqual([0, 1, 2]);
  });
});

describe('buildReorderPayload', () => {
  it('returns ids with sequential positions in sorted order', () => {
    const payload = buildReorderPayload([subscription('b', 2), subscription('a', 1)]);

    expect(payload).toEqual([
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
    ]);
  });
});
