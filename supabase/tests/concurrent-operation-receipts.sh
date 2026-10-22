#!/usr/bin/env bash
set -euo pipefail

test_user=33333333-3333-4333-8333-333333333333
cleanup() {
  psql -v ON_ERROR_STOP=1 -c "DELETE FROM auth.users WHERE id = '$test_user'" >/dev/null
}
trap cleanup EXIT
psql -v ON_ERROR_STOP=1 -c "INSERT INTO auth.users(id, email) VALUES ('$test_user', 'concurrent@example.invalid')" >/dev/null

pids=()
for attempt in {1..8}; do
  psql -v ON_ERROR_STOP=1 -f supabase/tests/concurrent-create.sql >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do
  wait "$pid"
done
item_id=$(psql -At -v ON_ERROR_STOP=1 -c "SELECT id FROM public.tracked_subscriptions WHERE user_id = '$test_user'")
psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
    ASSERT (SELECT count(*) FROM public.tracked_subscriptions WHERE user_id = '33333333-3333-4333-8333-333333333333') = 1, 'concurrent create retries duplicated a subscription';
    ASSERT (SELECT count(*) FROM public.subscription_operation_receipts WHERE user_id = '33333333-3333-4333-8333-333333333333') = 1, 'concurrent create retries duplicated a receipt';
END;
$$;
SQL
for operation_kind in update reorder delete; do
  pids=()
  for attempt in {1..8}; do
    psql -v ON_ERROR_STOP=1 -v operation_kind="$operation_kind" -v item_id="$item_id" \
      -f supabase/tests/concurrent-mutation.sql >/dev/null &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do
    wait "$pid"
  done
done
psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
    ASSERT NOT EXISTS (SELECT FROM public.tracked_subscriptions WHERE user_id = '33333333-3333-4333-8333-333333333333'), 'concurrent delete did not remove the subscription';
    ASSERT (SELECT count(*) FROM public.subscription_operation_receipts WHERE user_id = '33333333-3333-4333-8333-333333333333') = 4, 'concurrent retries duplicated or lost a receipt';
    ASSERT (SELECT response ->> 'name' FROM public.subscription_operation_receipts WHERE user_id = '33333333-3333-4333-8333-333333333333' AND operation_id = 'concurrent-update') = 'Concurrent edit', 'concurrent update did not persist its original result';
    ASSERT (SELECT count(*) FROM public.subscription_operation_receipts WHERE user_id = '33333333-3333-4333-8333-333333333333' AND response ->> 'create_operation_id' = 'concurrent-create') = 2, 'concurrent create or update returned a different subscription';
END;
$$;
SQL
