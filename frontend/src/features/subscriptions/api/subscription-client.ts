import type {
  TrackedSubscription,
  CreateTrackedSubscriptionInput,
  UpdateTrackedSubscriptionInput,
  BillingCycle,
  SubscriptionCategory,
  ReviewPriority,
} from '@/types';
import { createClient } from '@/lib/supabase/client';

export type SubscriptionListParams = {
  search?: string;
  category?: string;
  billingCycle?: string;
  reviewPriority?: string;
  locked?: boolean;
  sort?: string;
  order?: string;
  page?: number;
  limit?: number;
};

export type ReorderSubscriptionsInput = {
  items: { id: string; position: number }[];
};

function mapRow(row: Record<string, unknown>): TrackedSubscription {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    amountYen: row.amount_yen as number,
    billingCycle: row.billing_cycle as BillingCycle,
    category: (row.category as SubscriptionCategory) ?? undefined,
    reviewPriority: row.review_priority as ReviewPriority,
    locked: row.locked as boolean,
    billingDay: (row.billing_day as number) ?? undefined,
    note: row.note as string,
    position: row.position as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export const subscriptionApi = {
  async list(): Promise<TrackedSubscription[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('tracked_subscriptions')
      .select('*')
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1000);

    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  },

  async create(input: CreateTrackedSubscriptionInput): Promise<TrackedSubscription> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get the next position
    const { data: maxRow } = await supabase
      .from('tracked_subscriptions')
      .select('position')
      .eq('user_id', user.id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const nextPosition = maxRow ? (maxRow.position as number) + 1 : 0;

    const { data, error } = await supabase
      .from('tracked_subscriptions')
      .insert({
        user_id: user.id,
        name: input.name,
        amount_yen: input.amountYen,
        billing_cycle: input.billingCycle,
        category: input.category ?? null,
        review_priority: input.reviewPriority,
        locked: input.locked ?? false,
        billing_day: input.billingDay ?? null,
        note: input.note ?? '',
        position: nextPosition,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapRow(data);
  },

  async update(id: string, input: UpdateTrackedSubscriptionInput): Promise<TrackedSubscription> {
    const supabase = createClient();
    const updates: Record<string, unknown> = {};

    if (input.name !== undefined) updates.name = input.name;
    if (input.amountYen !== undefined) updates.amount_yen = input.amountYen;
    if (input.billingCycle !== undefined) updates.billing_cycle = input.billingCycle;
    if (input.clearCategory) {
      updates.category = null;
    } else if (input.category !== undefined) {
      updates.category = input.category;
    }
    if (input.reviewPriority !== undefined) updates.review_priority = input.reviewPriority;
    if (input.locked !== undefined) updates.locked = input.locked;
    if (input.clearBillingDay) {
      updates.billing_day = null;
    } else if (input.billingDay !== undefined) {
      updates.billing_day = input.billingDay;
    }
    if (input.note !== undefined) updates.note = input.note;

    if (Object.keys(updates).length === 0) {
      // No changes, just return the current row
      const { data, error } = await supabase
        .from('tracked_subscriptions')
        .select()
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return mapRow(data);
    }

    const { data, error } = await supabase
      .from('tracked_subscriptions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapRow(data);
  },

  async delete(id: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('tracked_subscriptions')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  async reorder(input: ReorderSubscriptionsInput): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase.rpc('reorder_subscriptions', {
      items: input.items,
    });

    if (error) throw new Error(error.message);
  },
};
