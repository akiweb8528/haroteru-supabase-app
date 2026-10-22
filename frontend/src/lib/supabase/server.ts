import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseAuthCookieOptions } from '@/lib/supabase/config';
import { resolveSupabaseServerUrl } from '@/lib/utils';

export function createClient() {
  const cookieStore = cookies();
  const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  return createServerClient(
    resolveSupabaseServerUrl(
      process.env.SUPABASE_SERVER_URL ?? publicSupabaseUrl,
      publicSupabaseUrl,
    ),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: getSupabaseAuthCookieOptions(publicSupabaseUrl),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    },
  );
}
