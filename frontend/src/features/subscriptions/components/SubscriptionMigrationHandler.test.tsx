import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionMigrationHandler } from './SubscriptionMigrationHandler';
import type { TrackedSubscription } from '@/types';
import { requestLocalSubscriptionsMigration } from '@/features/subscriptions/lib/local-storage';
import { acknowledgeAuthenticatedPendingOperation, queueAuthenticatedGuestImport, readAuthenticatedSubscriptionsState, setAuthenticatedSyncError } from '@/features/subscriptions/lib/authenticated-sync-storage';

const mocks = vi.hoisted(() => ({ session: vi.fn(), create: vi.fn(), lock: vi.fn(), mutate: vi.fn() }));
vi.mock('@/providers/SessionProvider', () => ({ useSession: mocks.session }));
vi.mock('swr', () => ({ mutate: mocks.mutate }));
vi.mock('@/features/subscriptions/api/subscription-client', () => ({ subscriptionApi: { create: mocks.create } }));
vi.mock('@/features/subscriptions/lib/authenticated-sync', () => ({ withAuthenticatedStorageLock: mocks.lock }));

const item = (id = 'guest-1', name = 'Netflix'): TrackedSubscription => ({
  id, userId: 'local', name, amountYen: 980, billingCycle: 'monthly', category: 'video',
  reviewPriority: 'medium', locked: false, note: '', position: 0,
  createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
});
const guestKey = 'local_subscriptions';
const authKey = 'authenticated_subscriptions_sync_v1';
function session(userId = 'user-a') {
  return { status: 'authenticated', data: { user: { id: userId }, backendAccessToken: 'token' }, user: { id: userId } };
}

describe('SubscriptionMigrationHandler のキューへの引き渡し', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.session.mockReturnValue(session());
    mocks.create.mockResolvedValue(undefined);
    mocks.lock.mockImplementation((change: () => unknown) => Promise.resolve().then(change));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('通信を待たずowner付きキューへ保存してから元データを除去する', async () => {
    localStorage.setItem(guestKey, JSON.stringify([item(), item('guest-2', 'Spotify')]));
    render(<SubscriptionMigrationHandler />);
    await waitFor(() => expect(readAuthenticatedSubscriptionsState('user-a').pendingOperations).toHaveLength(2));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(readAuthenticatedSubscriptionsState('user-a').subscriptions.map((entry) => entry.userId)).toEqual(['user-a', 'user-a']);
    expect(localStorage.getItem(guestKey)).toBeNull();
  });

  it('成功応答が失われても再試行・再読込で新たなcreateを増やさない', async () => {
    const source = item();
    localStorage.setItem(guestKey, JSON.stringify([source]));
    mocks.create.mockRejectedValue(new Error('successful response was lost'));
    const view = render(<SubscriptionMigrationHandler />);
    await waitFor(() => expect(readAuthenticatedSubscriptionsState('user-a').pendingOperations).toHaveLength(1));
    const sent = readAuthenticatedSubscriptionsState('user-a').pendingOperations[0];
    localStorage.setItem(guestKey, JSON.stringify([source]));
    act(() => requestLocalSubscriptionsMigration());
    await waitFor(() => expect(localStorage.getItem(guestKey)).toBeNull());
    view.unmount();
    localStorage.setItem(guestKey, JSON.stringify([source]));
    render(<SubscriptionMigrationHandler />);
    await waitFor(() => expect(localStorage.getItem(guestKey)).toBeNull());
    expect(readAuthenticatedSubscriptionsState('user-a').pendingOperations).toEqual([sent]);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('ack後もsource markerを残し既存項目を再作成しない', async () => {
    const source = item();
    localStorage.setItem(guestKey, JSON.stringify([source]));
    render(<SubscriptionMigrationHandler />);
    await waitFor(() => expect(readAuthenticatedSubscriptionsState('user-a').pendingOperations).toHaveLength(1));
    const state = readAuthenticatedSubscriptionsState('user-a');
    act(() => acknowledgeAuthenticatedPendingOperation('user-a', state.pendingOperations[0].id, { ...state.subscriptions[0], id: 'server-1' }));
    localStorage.setItem(guestKey, JSON.stringify([source]));
    act(() => requestLocalSubscriptionsMigration());
    await waitFor(() => expect(localStorage.getItem(guestKey)).toBeNull());
    expect(readAuthenticatedSubscriptionsState('user-a').pendingOperations).toHaveLength(0);
    expect(readAuthenticatedSubscriptionsState('user-a').subscriptions).toHaveLength(1);
  });

  it.each(['append', 'edit'])('コピー中のguest変更を除去しない: %s', async (change) => {
    const source = item();
    const changed = change === 'append' ? [source, item('guest-2', '追加した項目')] : [{ ...source, note: 'コピー中に編集' }];
    localStorage.setItem(guestKey, JSON.stringify([source]));
    const originalSet = Storage.prototype.setItem;
    let injected = false;
    const inject = () => { if (!injected) { injected = true; originalSet.call(localStorage, guestKey, JSON.stringify(changed)); } };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      originalSet.call(this, key, value);
      if (key === authKey) inject();
    });
    mocks.create.mockImplementation(async () => { inject(); });
    render(<SubscriptionMigrationHandler />);
    await waitFor(() => expect(readAuthenticatedSubscriptionsState('user-a').pendingOperations).toHaveLength(1));
    expect(JSON.parse(localStorage.getItem(guestKey) ?? '[]')).toEqual(change === 'append' ? [changed[1]] : changed);
    act(() => requestLocalSubscriptionsMigration());
    await waitFor(() => expect(localStorage.getItem(guestKey)).toBeNull());
    const next = readAuthenticatedSubscriptionsState('user-a');
    expect(next.pendingOperations.filter((operation) => operation.type === 'create')).toHaveLength(change === 'append' ? 2 : 1);
    if (change === 'edit') {
      expect(next.subscriptions[0].note).toBe('コピー中に編集');
      localStorage.setItem(guestKey, JSON.stringify([source]));
      act(() => requestLocalSubscriptionsMigration());
      await waitFor(() => expect(localStorage.getItem(guestKey)).toBeNull());
      expect(readAuthenticatedSubscriptionsState('user-a').subscriptions[0].note).toBe('コピー中に編集');
      expect(readAuthenticatedSubscriptionsState('user-a').pendingOperations).toHaveLength(2);
    }
  });

  it('guest削除失敗を通知し、再試行でも保存済みcreateを重複させない', async () => {
    localStorage.setItem(guestKey, JSON.stringify([item()]));
    const originalRemove = Storage.prototype.removeItem;
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
      if (key === guestKey) throw new DOMException('blocked', 'SecurityError');
      return originalRemove.call(this, key);
    });
    render(<SubscriptionMigrationHandler />);
    await waitFor(() => expect(readAuthenticatedSubscriptionsState('user-a')).toMatchObject({ migrationError: expect.any(String) }));
    expect(localStorage.getItem(guestKey)).not.toBeNull();
    expect(readAuthenticatedSubscriptionsState('user-a').pendingOperations).toHaveLength(1);
    remove.mockRestore();
    act(() => requestLocalSubscriptionsMigration());
    await waitFor(() => expect(localStorage.getItem(guestKey)).toBeNull());
    expect(readAuthenticatedSubscriptionsState('user-a').pendingOperations).toHaveLength(1);
  });

  it('保存処理を待つ間にログアウトしたら元ownerのコピーを開始しない', async () => {
    localStorage.setItem(guestKey, JSON.stringify([item()]));
    let release!: () => void;
    mocks.lock.mockImplementation((change: () => unknown) => new Promise<void>((resolve) => { release = () => { change(); resolve(); }; }));
    const view = render(<SubscriptionMigrationHandler />);
    mocks.session.mockReturnValue({ status: 'unauthenticated', data: null, user: null });
    view.rerender(<SubscriptionMigrationHandler />);
    await act(async () => release());
    expect(readAuthenticatedSubscriptionsState('user-a').pendingOperations).toHaveLength(0);
    expect(localStorage.getItem(guestKey)).not.toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('別ownerで同じsourceを再importしない', async () => {
    const source = item();
    localStorage.setItem(guestKey, JSON.stringify([source]));
    const view = render(<SubscriptionMigrationHandler />);
    await waitFor(() => expect(readAuthenticatedSubscriptionsState('user-a').pendingOperations).toHaveLength(1));
    localStorage.setItem(guestKey, JSON.stringify([source]));
    mocks.session.mockReturnValue(session('user-b'));
    view.rerender(<SubscriptionMigrationHandler />);
    await waitFor(() => expect(readAuthenticatedSubscriptionsState('user-b')).toMatchObject({ migrationError: expect.any(String) }));
    expect(readAuthenticatedSubscriptionsState('user-b').pendingOperations).toHaveLength(0);
    expect(localStorage.getItem(guestKey)).not.toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('別ownerのsourceだけを残して残りの項目をキューへ引き渡す', async () => {
    const claimed = item();
    queueAuthenticatedGuestImport('other-owner', claimed);
    localStorage.setItem(guestKey, JSON.stringify([claimed, item('guest-2', '移行できる項目')]));
    render(<SubscriptionMigrationHandler />);
    await waitFor(() => expect(readAuthenticatedSubscriptionsState('user-a').pendingOperations).toHaveLength(1));
    expect(readAuthenticatedSubscriptionsState('user-a').subscriptions[0].name).toBe('移行できる項目');
    expect(JSON.parse(localStorage.getItem(guestKey) ?? '[]')).toEqual([claimed]);
    await waitFor(() => expect(readAuthenticatedSubscriptionsState('user-a')).toMatchObject({ migrationError: expect.any(String) }));
  });

  it('部分移行失敗は成功したキューのdrain後も保持し、移行の再試行成功時にだけ解除する', async () => {
    localStorage.setItem(guestKey, JSON.stringify([item(), item('guest-2', '保存できなかった項目')]));
    const originalSet = Storage.prototype.setItem;
    let failed = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === authKey && !failed && JSON.parse(value)['user-a'].pendingOperations.length === 2) {
        failed = true;
        throw new DOMException('temporarily full', 'QuotaExceededError');
      }
      return originalSet.call(this, key, value);
    });
    render(<SubscriptionMigrationHandler />);
    await waitFor(() => expect(readAuthenticatedSubscriptionsState('user-a')).toMatchObject({ migrationError: expect.any(String) }));
    const state = readAuthenticatedSubscriptionsState('user-a');
    expect(state.pendingOperations).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(guestKey) ?? '[]')).toEqual([item('guest-2', '保存できなかった項目')]);
    act(() => {
      acknowledgeAuthenticatedPendingOperation('user-a', state.pendingOperations[0].id, { ...state.subscriptions[0], id: 'server-1' });
      setAuthenticatedSyncError('user-a', null);
    });
    expect(readAuthenticatedSubscriptionsState('user-a')).toMatchObject({ pendingOperations: [], syncError: null, migrationError: expect.any(String) });
    act(() => requestLocalSubscriptionsMigration());
    await waitFor(() => expect(localStorage.getItem(guestKey)).toBeNull());
    await waitFor(() => expect(readAuthenticatedSubscriptionsState('user-a')).toMatchObject({ migrationError: null }));
    expect(readAuthenticatedSubscriptionsState('user-a').pendingOperations).toHaveLength(1);
  });

  it('認証済み保存が失敗してもguest原本を除去しない', async () => {
    const source = JSON.stringify([item()]);
    localStorage.setItem(guestKey, source);
    const originalSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === authKey) throw new DOMException('full', 'QuotaExceededError');
      return originalSet.call(this, key, value);
    });
    render(<SubscriptionMigrationHandler />);
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(localStorage.getItem(guestKey)).toBe(source);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('壊れたguest保存を空配列とみなして消去しない', async () => {
    localStorage.setItem(guestKey, '{invalid');
    render(<SubscriptionMigrationHandler />);
    await waitFor(() => expect(readAuthenticatedSubscriptionsState('user-a')).toMatchObject({ migrationError: expect.any(String) }));
    expect(localStorage.getItem(guestKey)).toBe('{invalid');
  });
});
