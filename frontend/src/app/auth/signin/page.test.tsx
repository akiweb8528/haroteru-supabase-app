// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignInPage from './page';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getServerUser: mocks.getUser }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/components/auth/SignInButton', () => ({ SignInButton: () => null }));
vi.mock('@/components/layout/BrandLogo', () => ({ BrandLogo: () => null }));

describe('サインイン済みの遷移', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ id: 'user-1' });
    mocks.redirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT'); });
  });
  it.each(['/.//evil.com', '/%2e//evil.com', '//evil.com'])('callbackUrl が %s でもアプリ内に戻る', async (callbackUrl) => {
    await expect(SignInPage({ searchParams: { callbackUrl } })).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenCalledWith('/subscriptions');
  });
  it('安全な callbackUrl の query と hash を保持する', async () => {
    await expect(SignInPage({ searchParams: { callbackUrl: '/settings?tab=profile#avatar' } })).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenCalledWith('/settings?tab=profile#avatar');
  });
  it('認証失敗を表示する場合はリダイレクトしない', async () => {
    await SignInPage({ searchParams: { error: 'OAuthCallback' } });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
