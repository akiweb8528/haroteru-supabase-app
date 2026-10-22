import type {
  TrackedSubscription,
  CreateTrackedSubscriptionInput,
  UpdateTrackedSubscriptionInput,
  BillingCycle,
  SubscriptionCategory,
  ReviewPriority,
} from '@/types';
import { createClient } from '@/lib/supabase/client';
import { ApiError } from '@/shared/api/http-client';

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
    createOperationId: (row.create_operation_id as string | null | undefined) ?? undefined,
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

type AuthenticatedRequest = Awaited<ReturnType<typeof authenticatedRequest>>;

async function authenticatedRequest(expectedUserId?: string, signal?: AbortSignal) {
  const supabase = createClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session || (expectedUserId && session.user.id !== expectedUserId)) {
    throw new ApiError('ログイン状態が変わりました。変更はこの端末に保存されています。', 401, 'session_changed');
  }
  const { data: { user }, error } = await supabase.auth.getUser(session.access_token);
  if (error || !user || user.id !== session.user.id || (expectedUserId && user.id !== expectedUserId)) {
    throw new ApiError('ログイン状態が変わりました。変更はこの端末に保存されています。', 401, 'session_changed');
  }
  const timeout = AbortSignal.timeout(15_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  requestSignal.throwIfAborted();
  // Pin this request to the verified token even if another account signs in later.
  return { supabase, userId: user.id, token: session.access_token, signal: requestSignal };
}

function requestError(error: { message: string; code?: string }, status?: number) {
  const conflict = error.message.includes('operation_conflict');
  const rejected = !conflict && ['22001', '22003', '22023', '22P02', '23502', '23503', '23505', '23514', 'P0002'].includes(error.code ?? '');
  return new ApiError(error.message, conflict ? 409 : error.code === 'P0002' ? 404 : status ?? 0, conflict ? 'operation_conflict' : error.code ?? 'network_error', undefined, rejected);
}

async function applyOperation(request: AuthenticatedRequest, kind: string, id: string | null, payload: unknown, operationId?: string) {
  const { data, error, status } = await request.supabase.rpc('apply_subscription_operation', {
    operation_id: operationId ?? crypto.randomUUID(),
    operation_kind: kind,
    subscription_id: id,
    payload,
  }).setHeader('Authorization', `Bearer ${request.token}`).abortSignal(request.signal);
  if (error) throw requestError(error, status);
  return data;
}

export const subscriptionApi = {
  async list(expectedUserId?: string, signal?: AbortSignal): Promise<TrackedSubscription[]> {
    const request = await authenticatedRequest(expectedUserId, signal);
    const { data, error, status } = await request.supabase
      .from('tracked_subscriptions')
      .select('*')
      .eq('user_id', request.userId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1000)
      .setHeader('Authorization', `Bearer ${request.token}`)
      .abortSignal(request.signal);
    if (error) throw requestError(error, status);
    return (data ?? []).map(mapRow);
  },

  async create(input: CreateTrackedSubscriptionInput, operationId?: string, expectedUserId?: string, signal?: AbortSignal): Promise<TrackedSubscription> {
    const request = await authenticatedRequest(expectedUserId, signal);
    return mapRow(await applyOperation(request, 'create', null, input, operationId));
  },

  async update(id: string, input: UpdateTrackedSubscriptionInput, operationId?: string, expectedUserId?: string, signal?: AbortSignal): Promise<TrackedSubscription> {
    const request = await authenticatedRequest(expectedUserId, signal);
    return mapRow(await applyOperation(request, 'update', id, input, operationId));
  },

  async delete(id: string, operationId?: string, expectedUserId?: string, signal?: AbortSignal): Promise<void> {
    const request = await authenticatedRequest(expectedUserId, signal);
    await applyOperation(request, 'delete', id, {}, operationId);
  },

  async reorder(input: ReorderSubscriptionsInput, operationId?: string, expectedUserId?: string, signal?: AbortSignal): Promise<void> {
    const request = await authenticatedRequest(expectedUserId, signal);
    await applyOperation(request, 'reorder', null, input, operationId);
  },
};
