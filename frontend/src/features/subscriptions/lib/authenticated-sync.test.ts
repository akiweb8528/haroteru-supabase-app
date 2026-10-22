import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackedSubscription } from '@/types';
import { syncAuthenticatedSubscriptions, nextAuthenticatedRetryDelay } from './authenticated-sync';
import { queueAuthenticatedCreate, queueAuthenticatedDelete, queueAuthenticatedReorder, queueAuthenticatedUpdate, readAuthenticatedSubscriptionsState, writeAuthenticatedSubscriptionsState } from './authenticated-sync-storage';
const api = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), delete: vi.fn(), reorder: vi.fn() }));
vi.mock('@/features/subscriptions/api/subscription-client', () => ({ subscriptionApi: api }));
const input = { name: 'Local', amountYen: 100, billingCycle: 'monthly' as const, reviewPriority: 'medium' as const };
const item = (id: string, position = 0): TrackedSubscription => ({ ...input, id, userId: 'user-1', locked: false, note: '', position, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
function seed() {
  writeAuthenticatedSubscriptionsState('user-1', { subscriptions: [item('a'), item('b', 1)], pendingOperations: [], syncError: null, lastSyncedAt: null });
}
const options = { isCurrentUser: () => true };
describe('authenticated sync sender', () => {
  beforeEach(() => {
    localStorage.clear(); vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    api.create.mockResolvedValue(item('created'));
    api.update.mockResolvedValue(item('a'));
    api.delete.mockResolvedValue(undefined);
    api.reorder.mockResolvedValue(undefined);
    seed();
  });
  it('失敗操作を保持し、別項目は同期し、同項目の後続更新は待つ', async () => {
    queueAuthenticatedUpdate('user-1', 'a', { name: 'first' });
    queueAuthenticatedUpdate('user-1', 'a', { amountYen: 999 });
    queueAuthenticatedUpdate('user-1', 'b', { name: 'independent' });
    api.update.mockRejectedValueOnce(new Error('temporary failure'));
    await syncAuthenticatedSubscriptions('user-1', options);
    expect(api.update.mock.calls.map((call) => call[0])).toEqual(['a', 'b']);
    const pending = readAuthenticatedSubscriptionsState('user-1').pendingOperations;
    expect(pending).toHaveLength(2);
    expect(pending[0].attemptCount).toBe(1);
    expect(pending[1].attemptCount ?? 0).toBe(0);
    expect(nextAuthenticatedRetryDelay('user-1')).toBeGreaterThan(0);
    await syncAuthenticatedSubscriptions('user-1', options);
    expect(api.update).toHaveBeenCalledTimes(2);
    await syncAuthenticatedSubscriptions('user-1', { ...options, manual: true });
    expect(readAuthenticatedSubscriptionsState('user-1').pendingOperations).toHaveLength(0);
    expect(api.update.mock.calls[2][2]).toBe(api.update.mock.calls[0][2]);
  });
  it('複数senderでも送信は一度で、削除中のreorderと他操作を取り違えない', async () => {
    let finish!: () => void;
    api.delete.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    queueAuthenticatedDelete('user-1', 'a');
    const first = syncAuthenticatedSubscriptions('user-1', options);
    const second = syncAuthenticatedSubscriptions('user-1', options);
    await vi.waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
    const remaining = readAuthenticatedSubscriptionsState('user-1').subscriptions;
    queueAuthenticatedReorder('user-1', remaining);
    queueAuthenticatedUpdate('user-1', 'b', { amountYen: 555 });
    finish(); await Promise.all([first, second]);
    expect(api.reorder).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(readAuthenticatedSubscriptionsState('user-1').pendingOperations).toHaveLength(0);
  });
  it('応答消失後は同じIDでcreateを再送し、後続編集も送る', async () => {
    const created = queueAuthenticatedCreate('user-1', input);
    queueAuthenticatedUpdate('user-1', created.subscription.id, { name: 'later' });
    api.create.mockRejectedValueOnce(new Error('lost success response'));
    await syncAuthenticatedSubscriptions('user-1', options);
    expect(api.update).not.toHaveBeenCalled();
    await syncAuthenticatedSubscriptions('user-1', { ...options, manual: true });
    expect(api.create.mock.calls[1][1]).toBe(api.create.mock.calls[0][1]);
    expect(api.create.mock.calls[1][0]).toEqual(input);
    expect(api.update.mock.calls[0].slice(0,2)).toEqual(['created', { name: 'later' }]);
  });
  it('自動再試行は有限で、再読み込み相当でも停止し手動で回復できる', async () => {
    queueAuthenticatedUpdate('user-1', 'a', { name: 'edit' });
    api.update.mockRejectedValue(new Error('still offline'));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const state = readAuthenticatedSubscriptionsState('user-1');
      state.pendingOperations[0].lastAttemptAt = '2000-01-01T00:00:00.000Z';
      writeAuthenticatedSubscriptionsState('user-1', state);
      await syncAuthenticatedSubscriptions('user-1', options);
    }
    expect(nextAuthenticatedRetryDelay('user-1')).toBeNull();
    await syncAuthenticatedSubscriptions('user-1', options);
    expect(api.update).toHaveBeenCalledTimes(5);
    api.update.mockResolvedValue(item('a'));
    await syncAuthenticatedSubscriptions('user-1', { ...options, manual: true });
    expect(readAuthenticatedSubscriptionsState('user-1').pendingOperations).toHaveLength(0);
  });
  it('認証状態が変わると後続を送らず、元ユーザーの未送信分を保持する', async () => {
    queueAuthenticatedUpdate('user-1', 'a', { name: 'first' });
    queueAuthenticatedUpdate('user-1', 'b', { name: 'second' });
    let current = true;
    api.update.mockImplementationOnce(async () => { current = false; return item('a'); });
    await syncAuthenticatedSubscriptions('user-1', { isCurrentUser: () => current });
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update.mock.calls[0][3]).toBe('user-1');
    expect(readAuthenticatedSubscriptionsState('user-1').pendingOperations).toHaveLength(1);
    expect(readAuthenticatedSubscriptionsState('user-2').subscriptions).toEqual([]);
  });
  it('timeoutはキューを保持してsenderを解放し、再試行できる', async () => {
    vi.useFakeTimers();
    try {
      queueAuthenticatedUpdate('user-1', 'a', { name: 'edit' });
      api.update.mockReturnValueOnce(new Promise(() => {}));
      const run = syncAuthenticatedSubscriptions('user-1', options);
      await vi.advanceTimersByTimeAsync(15_001);
      await run;
      expect(readAuthenticatedSubscriptionsState('user-1').pendingOperations).toHaveLength(1);
      expect(api.update.mock.calls[0][4].aborted).toBe(true);
      await syncAuthenticatedSubscriptions('user-1', { ...options, manual: true });
      expect(readAuthenticatedSubscriptionsState('user-1').pendingOperations).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });
  it('確定拒否だけを記録し、再編集すると新IDで保存できる', async () => {
    const local = queueAuthenticatedCreate('user-1', input);
    api.create.mockRejectedValueOnce(Object.assign(new Error('invalid'), { definitivelyRejected: true }));
    await syncAuthenticatedSubscriptions('user-1', options);
    expect(readAuthenticatedSubscriptionsState('user-1').pendingOperations[0].definitivelyRejected).toBe(true);
    queueAuthenticatedUpdate('user-1', local.subscription.id, { name: 'Corrected' });
    await syncAuthenticatedSubscriptions('user-1', options);
    expect(api.create.mock.calls[1][1]).not.toBe(api.create.mock.calls[0][1]);
    expect(api.create.mock.calls[1][0].name).toBe('Corrected');
    expect(readAuthenticatedSubscriptionsState('user-1').pendingOperations).toHaveLength(0);
  });

  it('不正な再試行時刻でも待機や再試行ループに陥らない', async () => {
    queueAuthenticatedUpdate('user-1', 'a', { name: 'Saved' });
    const saved = readAuthenticatedSubscriptionsState('user-1');
    saved.pendingOperations[0].attemptCount = 1;
    saved.pendingOperations[0].lastAttemptAt = 'invalid-date';
    writeAuthenticatedSubscriptionsState('user-1', saved);
    expect(nextAuthenticatedRetryDelay('user-1')).toBe(0);
    await syncAuthenticatedSubscriptions('user-1', options);
    expect(api.update).toHaveBeenCalledTimes(1);
  });

});
