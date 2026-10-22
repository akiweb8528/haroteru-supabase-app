import { createClient } from '@/lib/supabase/server';

export async function getServerUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getServerProfile() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  return {
    id: profile.id as string,
    email: profile.email as string,
    name: profile.name as string,
    image: (profile.avatar_url as string) || user.user_metadata?.avatar_url || null,
    tier: (profile.tier as string) || 'free',
  };
}
