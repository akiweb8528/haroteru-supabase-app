import { resolveServiceBaseUrl } from '@/lib/utils';

const DEFAULT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
const FALLBACK_AUTH_STORAGE_KEY = 'sb-auth-token';

export function getSupabaseAuthStorageKey(publicSupabaseUrl: string | undefined): string {
  const normalized = resolveServiceBaseUrl(publicSupabaseUrl, DEFAULT_PUBLIC_SUPABASE_URL);

  try {
    const hostnamePrefix = new URL(normalized).hostname.split('.')[0];
    return hostnamePrefix ? `sb-${hostnamePrefix}-auth-token` : FALLBACK_AUTH_STORAGE_KEY;
  } catch {
    return FALLBACK_AUTH_STORAGE_KEY;
  }
}

export function getSupabaseAuthCookieOptions(publicSupabaseUrl: string | undefined) {
  return {
    name: getSupabaseAuthStorageKey(publicSupabaseUrl),
  };
}
