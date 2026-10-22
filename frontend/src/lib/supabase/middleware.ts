import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAuthCookieOptions } from '@/lib/supabase/config';
import { resolveSupabaseServerUrl } from '@/lib/utils';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabase = createServerClient(
    resolveSupabaseServerUrl(
      process.env.SUPABASE_SERVER_URL ?? publicSupabaseUrl,
      publicSupabaseUrl,
    ),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: getSupabaseAuthCookieOptions(publicSupabaseUrl),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, supabaseResponse };
}
