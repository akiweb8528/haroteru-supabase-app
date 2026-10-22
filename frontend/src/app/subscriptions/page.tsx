import type { Metadata } from 'next';
import { SubscriptionDashboard } from '@/features/subscriptions/components/SubscriptionDashboard';

export const metadata: Metadata = { title: 'ダッシュボード' };

export default function SubscriptionsPage() {
  return <SubscriptionDashboard />;
}
