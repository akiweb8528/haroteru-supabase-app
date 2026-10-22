import { describe, expect, it } from 'vitest';
import type { TrackedSubscription } from '@/types';
import { applySubscriptionFilters, buildSubscriptionSummary } from './subscription-filters';

const baseSubscription = (overrides: Partial<TrackedSubscription>): TrackedSubscription => ({
  id: overrides.id ?? 'sub-1',
  userId: 'user-1',
  name: overrides.name ?? 'Netflix',
  amountYen: overrides.amountYen ?? 1000,
  billingCycle: overrides.billingCycle ?? 'monthly',
  category: overrides.category,
  reviewPriority: overrides.reviewPriority ?? 'medium',
  locked: overrides.locked ?? false,
  billingDay: overrides.billingDay,
  note: overrides.note ?? '',
  position: overrides.position ?? 0,
  createdAt: overrides.createdAt ?? '2024-01-01T00:00:00Z',
  updatedAt: overrides.updatedAt ?? '2024-01-01T00:00:00Z',
});

describe('applySubscriptionFilters', () => {
  const subscriptions = [
    baseSubscription({ id: 'sub-1', name: 'Netflix', note: '家族プラン', position: 0, amountYen: 1490 }),
    baseSubscription({ id: 'sub-2', name: 'Spotify', note: '通勤中に聴く', position: 1, amountYen: 980, locked: true }),
    baseSubscription({ id: 'sub-3', name: 'Nintendo', note: 'yearly plan', position: 2, amountYen: 4800, billingCycle: 'yearly', reviewPriority: 'low' }),
  ];

  it('検索条件をフロントで適用する', () => {
    const filtered = applySubscriptionFilters(subscriptions, { search: '通勤' });
    expect(filtered.map((item) => item.id)).toEqual(['sub-2']);
  });

  it('ソート条件をフロントで適用する', () => {
    const filtered = applySubscriptionFilters(subscriptions, { sort: 'amount_yen', order: 'desc' });
    expect(filtered.map((item) => item.id)).toEqual(['sub-3', 'sub-1', 'sub-2']);
  });

  it('ロック条件をフロントで適用する', () => {
    const filtered = applySubscriptionFilters(subscriptions, { locked: true });
    expect(filtered.map((item) => item.id)).toEqual(['sub-2']);
  });
});

describe('buildSubscriptionSummary', () => {
  it('全件から集計を組み立てる', () => {
    const summary = buildSubscriptionSummary([
      baseSubscription({ amountYen: 1200, billingCycle: 'monthly', locked: true }),
      baseSubscription({ id: 'sub-2', amountYen: 6000, billingCycle: 'yearly', reviewPriority: 'low' }),
    ]);

    expect(summary).toEqual({
      monthlyEstimate: 1700,
      yearlyEstimate: 20400,
      subscriptionCount: 2,
      lockedCount: 1,
      reviewCount: 1,
    });
  });
});
