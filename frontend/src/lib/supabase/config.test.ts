import { describe, expect, it } from 'vitest';
import { getSupabaseAuthCookieOptions, getSupabaseAuthStorageKey } from './config';

describe('getSupabaseAuthStorageKey', () => {
  it('公開向け Supabase URL のホスト名から storage key を作る', () => {
    expect(getSupabaseAuthStorageKey('https://abcxyzcompany.supabase.co')).toBe(
      'sb-abcxyzcompany-auth-token',
    );
  });

  it('ローカルの loopback URL でも browser と同じ storage key を返す', () => {
    expect(getSupabaseAuthStorageKey('http://127.0.0.1:54321')).toBe('sb-127-auth-token');
  });

  it('未設定時はローカル開発の fallback を使う', () => {
    expect(getSupabaseAuthStorageKey(undefined)).toBe('sb-127-auth-token');
  });
});

describe('getSupabaseAuthCookieOptions', () => {
  it('server/client で共有する cookie 名を返す', () => {
    expect(getSupabaseAuthCookieOptions('http://127.0.0.1:54321')).toEqual({
      name: 'sb-127-auth-token',
    });
  });
});
