import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSupabaseAuthCookieOptions } from '@/lib/supabase/config';
import { normalizeLoopbackOrigin, resolveSupabaseServerUrl, sanitizeCallbackUrl } from '@/lib/utils';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const siteOrigin = normalizeLoopbackOrigin(origin);
  const code = searchParams.get('code');
  const next = sanitizeCallbackUrl(searchParams.get('next') ?? undefined);
  const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (code) {
    const cookieStore = cookies();
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
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Update profile with latest Google metadata
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const meta = user.user_metadata;
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: user.id,
          email: user.email ?? '',
          name: meta?.full_name ?? meta?.name ?? '',
          avatar_url: meta?.avatar_url ?? meta?.picture ?? '',
        }, { onConflict: 'id', ignoreDuplicates: false });

        if (profileError) {
          console.error('Failed to upsert profile after OAuth callback', {
            userId: user.id,
            error: profileError.message,
          });
        }
      }

      return NextResponse.redirect(`${siteOrigin}${next}`);
    }

    console.error('Failed to exchange OAuth code for session', {
      error: error.message,
    });
  }

  return NextResponse.redirect(`${siteOrigin}/auth/signin?error=OAuthCallback`);
}
