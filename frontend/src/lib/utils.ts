import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(value);
}

export function resolveServiceBaseUrl(value: string | undefined, fallback: string): string {
  const candidate = value?.trim();
  if (!candidate) {
    return fallback;
  }

  const withoutTrailingSlash = candidate.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(withoutTrailingSlash)) {
    return withoutTrailingSlash;
  }

  return `http://${withoutTrailingSlash}`;
}

export function resolveSiteOrigin(value: string | undefined, fallback: string): string {
  const normalized = resolveServiceBaseUrl(value, fallback);

  try {
    return normalizeLoopbackOrigin(new URL(normalized).origin);
  } catch {
    return normalizeLoopbackOrigin(new URL(fallback).origin);
  }
}

export function normalizeLoopbackOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.hostname === '0.0.0.0') {
      url.hostname = 'localhost';
    }
    return url.origin;
  } catch {
    return origin;
  }
}

export function resolveSupabaseServerUrl(value: string | undefined, fallback?: string): string {
  const normalized = resolveServiceBaseUrl(value, fallback ?? 'http://127.0.0.1:54321');

  try {
    const url = new URL(normalized);
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '0.0.0.0') {
      url.hostname = 'host.docker.internal';
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    return normalized;
  }
}

function normalizeCallbackPath(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return undefined;
  }

  try {
    const base = 'http://localhost';
    const url = new URL(candidate, base);
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Dot segments can turn an initially relative path into a protocol-relative URL.
    if (url.origin !== base || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
      return undefined;
    }
    return path;
  } catch {
    return undefined;
  }
}

export function sanitizeCallbackUrl(value: string | undefined, fallback = '/subscriptions'): string {
  return normalizeCallbackPath(value) ?? normalizeCallbackPath(fallback) ?? '/subscriptions';
}

export const reviewPriorityLabels: Record<string, string> = {
  low: '見直し候補',
  medium: 'ふつう',
  high: '優先度高め',
};

export const reviewPriorityColors: Record<string, string> = {
  low: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  medium: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  high: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
};

export const billingCycleLabels: Record<string, string> = {
  monthly: '月額',
  yearly: '年額',
};

export const categoryLabels: Record<string, string> = {
  video: '動画',
  music: '音楽',
  productivity: '仕事効率化',
  learning: '学習',
  shopping: '買い物',
  lifestyle: '生活',
  utilities: 'インフラ',
  other: 'その他',
};
