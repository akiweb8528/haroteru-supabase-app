import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SubscriptionList } from './SubscriptionList';
import type { TrackedSubscription } from '@/types';

vi.mock('@/providers/PreferencesProvider', () => ({
  usePreferences: () => ({
    taste: 'simple',
  }),
}));

const makeSubscription = (id: string, position: number): TrackedSubscription => ({
  id,
  userId: 'user-1',
  name: `Subscription ${id}`,
  amountYen: 1000,
  billingCycle: 'monthly',
  category: 'video',
  reviewPriority: 'medium',
  locked: false,
  note: '',
  position,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
});

describe('SubscriptionList', () => {
  const onUpdate = vi.fn();
  const onDelete = vi.fn();
  const onReorder = vi.fn().mockResolvedValue(undefined);
  const originalElementFromPoint = document.elementFromPoint;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.elementFromPoint = originalElementFromPoint;
  });

  it('つまみのタッチ操作で別カードにドロップすると並び替える', async () => {
    render(
      <SubscriptionList
        subscriptions={[makeSubscription('sub-1', 0), makeSubscription('sub-2', 1), makeSubscription('sub-3', 2)]}
        isLoading={false}
        error={null}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onReorder={onReorder}
        canReorder
      />,
    );

    const handles = screen.getAllByRole('button', { name: 'ドラッグして並び替える' });
    const targetCard = screen.getByText('Subscription sub-3').closest('[data-subscription-card-id]');
    expect(targetCard).not.toBeNull();
    document.elementFromPoint = vi.fn(() => targetCard);

    fireEvent.touchStart(handles[0], { touches: [{ clientX: 12, clientY: 24 }] });
    fireEvent.touchMove(handles[0], { touches: [{ clientX: 24, clientY: 128 }] });
    fireEvent.touchEnd(handles[0]);

    await waitFor(() => {
      expect(onReorder).toHaveBeenCalledWith('sub-1', 'sub-3');
    });
  });

  it('つまみをタッチしても同じカード上で終えたときは並び替えない', async () => {
    render(
      <SubscriptionList
        subscriptions={[makeSubscription('sub-1', 0), makeSubscription('sub-2', 1)]}
        isLoading={false}
        error={null}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onReorder={onReorder}
        canReorder
      />,
    );

    const handle = screen.getAllByRole('button', { name: 'ドラッグして並び替える' })[0];
    const sameCard = screen.getByText('Subscription sub-1').closest('[data-subscription-card-id]');
    expect(sameCard).not.toBeNull();
    document.elementFromPoint = vi.fn(() => sameCard);

    fireEvent.touchStart(handle, { touches: [{ clientX: 12, clientY: 24 }] });
    fireEvent.touchMove(handle, { touches: [{ clientX: 18, clientY: 40 }] });
    fireEvent.touchEnd(handle);

    await waitFor(() => {
      expect(onReorder).not.toHaveBeenCalled();
    });
  });
});
