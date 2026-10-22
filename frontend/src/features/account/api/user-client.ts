import type { MeResponse, DashboardSummary, BillingCycle } from '@/types';
import type { CopyTaste } from '@/lib/taste';
import { createClient } from '@/lib/supabase/client';

function computeSummary(subscriptions: Record<string, unknown>[]): DashboardSummary {
  let monthlyEstimate = 0;
  let yearlyEstimate = 0;
  let lockedCount = 0;
  let reviewCount = 0;

  for (const sub of subscriptions) {
    const amount = sub.amount_yen as number;
    const cycle = sub.billing_cycle as BillingCycle;
    const locked = sub.locked as boolean;
    const priority = sub.review_priority as string;

    if (cycle === 'monthly') {
      monthlyEstimate += amount;
      yearlyEstimate += amount * 12;
    } else {
      monthlyEstimate += Math.round(amount / 12);
      yearlyEstimate += amount;
    }
    if (locked) lockedCount++;
    if (priority === 'low') reviewCount++;
  }

  return {
    monthlyEstimate,
    yearlyEstimate,
    subscriptionCount: subscriptions.length,
    lockedCount,
    reviewCount,
  };
}

export const userApi = {
  async me(): Promise<MeResponse> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const [profileResult, subscriptionsResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('tracked_subscriptions').select('amount_yen, billing_cycle, locked, review_priority').eq('user_id', user.id),
    ]);

    if (profileResult.error) throw new Error(profileResult.error.message);
    const profile = profileResult.data;

    return {
      id: profile.id as string,
      email: profile.email as string,
      name: profile.name as string,
      avatarUrl: (profile.avatar_url as string) || user.user_metadata?.avatar_url || '',
      theme: (profile.theme as 'light' | 'dark') || 'light',
      useGoogleAvatar: profile.use_google_avatar as boolean,
      taste: (profile.taste as 'ossan' | 'simple') || 'ossan',
      summary: computeSummary(subscriptionsResult.data ?? []),
    };
  },

  async updatePreferences(input: { theme?: 'light' | 'dark'; useGoogleAvatar?: boolean; taste?: CopyTaste }): Promise<MeResponse> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const updates: Record<string, unknown> = {};
    if (input.theme !== undefined) updates.theme = input.theme;
    if (input.useGoogleAvatar !== undefined) updates.use_google_avatar = input.useGoogleAvatar;
    if (input.taste !== undefined) updates.taste = input.taste;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);
      if (error) throw new Error(error.message);
    }

    return this.me();
  },

  async deleteAccount(): Promise<void> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Delete profile (cascades tracked_subscriptions via FK)
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user.id);

    if (error) throw new Error(error.message);
  },
};
