import { describe, it, expect } from 'vitest';
import {
  cn,
  formatCurrency,
  resolveSupabaseServerUrl,
  sanitizeCallbackUrl,
  resolveSiteOrigin,
  resolveServiceBaseUrl,
} from './utils';

// 環境によって円記号が ¥(U+00A5) または ￥(U+FFE5) になるため
// 実際の Intl.NumberFormat 出力と比較する
const toJPY = (n: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n);

describe('formatCurrency', () => {
  it('整数の円金額を日本円形式にフォーマットする', () => {
    expect(formatCurrency(1000)).toBe(toJPY(1000));
  });

  it('0円をフォーマットする', () => {
    expect(formatCurrency(0)).toBe(toJPY(0));
  });

  it('大きな金額を3桁区切りでフォーマットする', () => {
    expect(formatCurrency(1000000)).toBe(toJPY(1000000));
    expect(formatCurrency(1000000)).toContain('1,000,000');
  });

  it('小数点以下は含まれない (maximumFractionDigits=0)', () => {
    expect(formatCurrency(124.5)).toBe(toJPY(124.5));
    expect(formatCurrency(124.5)).not.toContain('.');
  });
});

describe('cn (クラス名マージ)', () => {
  it('複数クラスを結合する', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('falsy な値を無視する', () => {
    expect(cn('foo', false && 'hidden', undefined, 'bar')).toBe('foo bar');
  });

  it('TailwindCSS の競合クラスを後勝ちでマージする', () => {
    // tailwind-merge: p-4 に p-2 を上書き
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });
});

describe('resolveServiceBaseUrl', () => {
  it('未設定時は fallback を返す', () => {
    expect(resolveServiceBaseUrl(undefined, 'http://localhost:8080')).toBe('http://localhost:8080');
  });

  it('http/https 付き URL はそのまま使う', () => {
    expect(resolveServiceBaseUrl('https://api.example.com/', 'http://localhost:8080')).toBe('https://api.example.com');
  });

  it('内部ネットワーク向けの host:port に http を補う', () => {
    expect(resolveServiceBaseUrl('haroteru-api:10000', 'http://localhost:8080')).toBe('http://haroteru-api:10000');
  });
});

describe('sanitizeCallbackUrl', () => {
  it('未設定時は fallback を返す', () => {
    expect(sanitizeCallbackUrl(undefined, '/subscriptions')).toBe('/subscriptions');
  });

  it('アプリ内パスはそのまま通す', () => {
    expect(sanitizeCallbackUrl('/settings?tab=profile#avatar')).toBe('/settings?tab=profile#avatar');
  });

  it('外部 URL は拒否する', () => {
    expect(sanitizeCallbackUrl('https://evil.example.com/phish')).toBe('/subscriptions');
  });

  it('protocol-relative URL は拒否する', () => {
    expect(sanitizeCallbackUrl('//evil.example.com/phish')).toBe('/subscriptions');
  });

  it('バックスラッシュを含む値は拒否する', () => {
    expect(sanitizeCallbackUrl('/\\evil')).toBe('/subscriptions');
  });
});

describe('resolveSiteOrigin', () => {
  it('0.0.0.0 を localhost に正規化する', () => {
    expect(resolveSiteOrigin(undefined, 'http://0.0.0.0:3000')).toBe('http://localhost:3000');
  });

  it('環境変数の localhost を優先する', () => {
    expect(resolveSiteOrigin('http://localhost:3000', 'http://0.0.0.0:3000')).toBe('http://localhost:3000');
  });
});

describe('resolveSupabaseServerUrl', () => {
  it('loopback の Supabase URL を host.docker.internal に置き換える', () => {
    expect(resolveSupabaseServerUrl('http://127.0.0.1:54321')).toBe('http://host.docker.internal:54321');
    expect(resolveSupabaseServerUrl('http://localhost:54321')).toBe('http://host.docker.internal:54321');
  });

  it('外部ホストはそのまま使う', () => {
    expect(resolveSupabaseServerUrl('https://example.supabase.co')).toBe('https://example.supabase.co');
  });
});
