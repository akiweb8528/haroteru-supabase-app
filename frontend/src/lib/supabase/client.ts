import { createBrowserClient } from '@supabase/ssr';
import { getPublicEnvValue } from '@/lib/public-env';
import { getSupabaseAuthCookieOptions } from '@/lib/supabase/config';

export function createClient() {
  const publicSupabaseUrl = getPublicEnvValue('NEXT_PUBLIC_SUPABASE_URL');

  return createBrowserClient(
    publicSupabaseUrl,
    getPublicEnvValue('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookieOptions: getSupabaseAuthCookieOptions(publicSupabaseUrl),
    },
  );
}
