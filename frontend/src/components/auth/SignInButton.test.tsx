import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInButton } from './SignInButton';
const mocks = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signInWithOAuth: mocks.signIn } }) }));

describe('Google サインインの callbackUrl', () => {
  beforeEach(() => vi.clearAllMocks());
  it('直接呼び出しても OAuth next に正規化後の危険なパスを渡さない', () => {
    render(<SignInButton callbackUrl="/.//evil.com" />);
    fireEvent.click(screen.getByRole('button'));
    const request = mocks.signIn.mock.calls[0][0];
    expect(new URL(request.options.redirectTo).searchParams.get('next')).toBe('/subscriptions');
  });
  it('compact 導線でもアプリ内の戻り先だけを渡す', () => {
    render(<SignInButton callbackUrl="/.//evil.com" compact />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/auth/signin?callbackUrl=%2Fsubscriptions');
  });
});
