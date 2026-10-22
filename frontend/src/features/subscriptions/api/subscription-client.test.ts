import { beforeEach, describe, expect, it, vi } from 'vitest';

const { client } = vi.hoisted(() => ({ client: { auth: { getUser: vi.fn(), getSession: vi.fn() }, rpc: vi.fn(), from: vi.fn() } }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => client }));
import { subscriptionApi } from './subscription-client';

describe('subscription operation identity and ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.auth.getUser.mockResolvedValue({ data: { user: { id: 'owner-a' } }, error: null });
    client.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner-a' }, access_token: 'a-token' } }, error: null });
    const builder = { setHeader: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockResolvedValue({ data: { id: 'sub-a', user_id: 'owner-a' }, error: null }) };
    client.rpc.mockReturnValue(builder);
  });

  it('never sends a queued user A mutation with user B credentials', async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: { id: 'owner-b' } }, error: null });
    await expect(subscriptionApi.create({ name: 'Music', amountYen: 1000, billingCycle: 'monthly', reviewPriority: 'medium' }, 'create-op', 'owner-a')).rejects.toMatchObject({ code: 'session_changed' });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('pins the verified account token on the RPC request', async () => {
    await subscriptionApi.delete('sub-a', 'delete-op', 'owner-a');
    expect(client.auth.getUser).toHaveBeenCalledWith('a-token');
    expect(client.rpc.mock.results[0].value.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer a-token');
  });

  it.each([['create-op', 'create-op'], [null, undefined], [undefined, undefined]])('maps nullable create operation identity (%s)', async (storedId, expected) => {
    client.rpc.mockReturnValue({ setHeader: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockResolvedValue({ data: { id: 'sub-a', user_id: 'owner-a', create_operation_id: storedId }, error: null }) });
    const result = await subscriptionApi.create({ name: 'Music', amountYen: 1000, billingCycle: 'monthly', reviewPriority: 'medium' }, 'create-op', 'owner-a');
    expect(result).toHaveProperty('createOperationId', expected);
  });

  it.each([
    ['23514', 'constraint failure', 400, true],
    ['P0002', 'subscription_not_found', 404, true],
    ['22023', 'operation_conflict', 400, false],
    ['PGRST202', 'function missing', 404, false],
    ['', 'network timeout', 0, false],
  ])('classifies a %s failure without treating uncertain delivery as rejection', async (code, message, status, rejected) => {
    client.rpc.mockReturnValue({ setHeader: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockResolvedValue({ data: null, error: { code, message }, status }) });
    await expect(subscriptionApi.update('sub-a', { amountYen: -1 }, 'update-op', 'owner-a')).rejects.toMatchObject({ definitivelyRejected: rejected });
  });

  it('sends stable identities to the transactional RPC for every queued mutation', async () => {
    const signal = new AbortController().signal;
    const input = { name: 'Music', amountYen: 1000, billingCycle: 'monthly' as const, reviewPriority: 'medium' as const };
    await subscriptionApi.create(input, 'create-op', 'owner-a', signal);
    await subscriptionApi.create(input, 'create-op', 'owner-a', signal);
    await subscriptionApi.update('sub-a', { name: 'New' }, 'update-op', 'owner-a', signal);
    await subscriptionApi.delete('sub-a', 'delete-op', 'owner-a', signal);
    await subscriptionApi.reorder({ items: [{ id: 'sub-b', position: 0 }] }, 'reorder-op', 'owner-a', signal);
    expect(client.rpc.mock.calls.map(([, payload]) => payload.operation_id)).toEqual(['create-op', 'create-op', 'update-op', 'delete-op', 'reorder-op']);
    expect(client.rpc.mock.calls.every(([name]) => name === 'apply_subscription_operation')).toBe(true);
    expect(client.from).not.toHaveBeenCalled();
  });
});
