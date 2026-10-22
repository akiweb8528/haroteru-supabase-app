import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionMigrationHandler } from './SubscriptionMigrationHandler';
import type { TrackedSubscription } from '@/types';
import { requestLocalSubscriptionsMigration } from '@/features/subscriptions/lib/local-storage';

const mockUseSession = vi.fn();
const mockCreate = vi.fn();
const mockMutate = vi.fn().mockResolvedValue(undefined);

vi.mock('@/providers/SessionProvider', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('swr', () => ({
  mutate: (...args: unknown[]) => mockMutate(...args),
}));

vi.mock('@/features/subscriptions/api/subscription-client', () => ({
  subscriptionApi: {
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

const baseSubscription = (id: string, name: string): TrackedSubscription => ({
  id,
  userId: 'local',
  name,
  amountYen: 980,
  billingCycle: 'monthly',
  category: 'video',
  reviewPriority: 'medium',
  locked: false,
  note: '',
  position: Number(id.replace('sub-', '')),
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
});

describe('SubscriptionMigrationHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseSession.mockReturnValue({ status: 'authenticated' });
  });

  it('全件成功時はローカル保存を削除する', async () => {
    const subscriptions = [
      baseSubscription('sub-1', 'Netflix'),
      baseSubscription('sub-2', 'Spotify'),
    ];
    localStorage.setItem('local_subscriptions', JSON.stringify(subscriptions));
    mockCreate.mockResolvedValue(undefined);

    render(<SubscriptionMigrationHandler />);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    expect(localStorage.getItem('local_subscriptions')).toBeNull();
    expect(mockMutate).toHaveBeenCalledTimes(2);
  });

  it('一部失敗時は失敗分だけローカルに残す', async () => {
    const subscriptions = [
      baseSubscription('sub-1', 'Netflix'),
      baseSubscription('sub-2', 'Spotify'),
    ];
    localStorage.setItem('local_subscriptions', JSON.stringify(subscriptions));
    mockCreate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('create failed'));

    render(<SubscriptionMigrationHandler />);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    expect(JSON.parse(localStorage.getItem('local_subscriptions') ?? '[]')).toEqual([subscriptions[1]]);
    expect(mockMutate).toHaveBeenCalledTimes(2);
  });

  it('再試行イベントで同期をやり直せる', async () => {
    const subscriptions = [baseSubscription('sub-1', 'Netflix')];
    localStorage.setItem('local_subscriptions', JSON.stringify(subscriptions));
    mockCreate
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);

    render(<SubscriptionMigrationHandler />);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
    expect(JSON.parse(localStorage.getItem('local_subscriptions') ?? '[]')).toEqual(subscriptions);

    requestLocalSubscriptionsMigration();

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
    expect(localStorage.getItem('local_subscriptions')).toBeNull();
  });

  it('キャッシュ更新に失敗しても再試行できる', async () => {
    const subscriptions = [baseSubscription('sub-1', 'Netflix')];
    localStorage.setItem('local_subscriptions', JSON.stringify(subscriptions));
    mockCreate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    mockMutate
      .mockRejectedValueOnce(new Error('mutate failed'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    render(<SubscriptionMigrationHandler />);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    localStorage.setItem('local_subscriptions', JSON.stringify(subscriptions));
    requestLocalSubscriptionsMigration();

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });
});
