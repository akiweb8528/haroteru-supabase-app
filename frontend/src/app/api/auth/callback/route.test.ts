// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), getUser: vi.fn(), upsert: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: vi.fn() }) }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({
  auth: { exchangeCodeForSession: mocks.exchange, getUser: mocks.getUser },
  from: () => ({ upsert: mocks.upsert }),
}) }));

describe('OAuth callback の戻り先', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchange.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null } });
  });
  it.each(['/.//evil.com', '/%2e//evil.com', '//evil.com'])('next が %s でも正規化後のアプリ内パスに戻る', async (next) => {
    const request = new Request(`https://app.example.com/api/auth/callback?${new URLSearchParams({ code: 'code', next })}`);
    const response = await GET(request);
    expect(response.headers.get('location')).toBe('https://app.example.com/subscriptions');
    expect(mocks.exchange).toHaveBeenCalledWith('code');
  });
  it('安全な戻り先と loopback の正規化を保持する', async () => {
    const response = await GET(new Request(`http://0.0.0.0:3000/api/auth/callback?${new URLSearchParams({ code: 'code', next: '/settings?tab=profile#avatar' })}`));
    expect(response.headers.get('location')).toBe('http://localhost:3000/settings?tab=profile#avatar');
  });
  it('認証失敗時は戻り先によらずサインインページへ戻る', async () => {
    mocks.exchange.mockResolvedValue({ error: { message: 'invalid code' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await GET(new Request('https://app.example.com/api/auth/callback?code=bad&next=/.//evil.com'));
    expect(response.headers.get('location')).toBe('https://app.example.com/auth/signin?error=OAuthCallback');
    vi.restoreAllMocks();
  });
});
