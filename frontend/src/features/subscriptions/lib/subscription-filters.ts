import type { DashboardSummary, TrackedSubscription } from '@/types';
import type { SubscriptionListParams } from '@/features/subscriptions/api/subscription-client';

export const SUBSCRIPTIONS_FETCH_LIMIT = 1000;

export function buildSubscriptionSummary(items: TrackedSubscription[]): DashboardSummary {
  const monthlyEstimate = items.reduce((sum, item) => sum + (item.billingCycle === 'yearly' ? Math.round(item.amountYen / 12) : item.amountYen), 0);
  const yearlyEstimate = items.reduce((sum, item) => sum + (item.billingCycle === 'yearly' ? item.amountYen : item.amountYen * 12), 0);
  const lockedCount = items.filter((item) => item.locked).length;
  const reviewCount = items.filter((item) => item.reviewPriority === 'low').length;

  return {
    monthlyEstimate,
    yearlyEstimate,
    subscriptionCount: items.length,
    lockedCount,
    reviewCount,
  };
}

export function applySubscriptionFilters(items: TrackedSubscription[], params: SubscriptionListParams): TrackedSubscription[] {
  let result = [...items];

  if (params.search) {
    const q = params.search.toLowerCase();
    result = result.filter((item) => item.name.toLowerCase().includes(q) || item.note.toLowerCase().includes(q));
  }

  if (params.category) {
    result = result.filter((item) => item.category === params.category);
  }

  if (params.billingCycle) {
    result = result.filter((item) => item.billingCycle === params.billingCycle);
  }

  if (params.reviewPriority) {
    result = result.filter((item) => item.reviewPriority === params.reviewPriority);
  }

  if (params.locked !== undefined) {
    result = result.filter((item) => item.locked === params.locked);
  }

  const sortField = params.sort ?? 'position';
  const dir = params.order === 'desc' ? -1 : 1;

  result.sort((a, b) => {
    switch (sortField) {
      case 'name':
        return dir * a.name.localeCompare(b.name, 'ja');
      case 'amount_yen':
        return dir * (a.amountYen - b.amountYen);
      case 'created_at':
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      default:
        return dir * (a.position - b.position);
    }
  });

  return result;
}
