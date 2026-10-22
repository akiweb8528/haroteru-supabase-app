-- The executor owns only the dispatcher, never the tables: existing subscription
-- RLS and the receipt policies still enforce auth.uid() on every statement.
CREATE ROLE haroteru_subscription_executor
    NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE SCHEMA subscription_sync_private;
REVOKE ALL ON SCHEMA subscription_sync_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA subscription_sync_private TO authenticated, haroteru_subscription_executor;
GRANT USAGE ON SCHEMA auth, public TO haroteru_subscription_executor;
GRANT EXECUTE ON FUNCTION auth.uid() TO haroteru_subscription_executor;

REVOKE ALL ON public.subscription_operation_receipts FROM PUBLIC, anon, authenticated;
DROP POLICY operation_receipts_select_own ON public.subscription_operation_receipts;
DROP POLICY operation_receipts_insert_own ON public.subscription_operation_receipts;
GRANT SELECT, INSERT ON public.subscription_operation_receipts TO haroteru_subscription_executor;
CREATE POLICY operation_receipts_executor_select ON public.subscription_operation_receipts
    FOR SELECT TO haroteru_subscription_executor USING ((SELECT auth.uid()) = user_id);
CREATE POLICY operation_receipts_executor_insert ON public.subscription_operation_receipts
    FOR INSERT TO haroteru_subscription_executor WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, DELETE ON public.tracked_subscriptions TO haroteru_subscription_executor;
GRANT INSERT (user_id, name, amount_yen, billing_cycle, category, review_priority,
    locked, billing_day, note, position, create_operation_id)
    ON public.tracked_subscriptions TO haroteru_subscription_executor;
GRANT UPDATE (name, amount_yen, billing_cycle, category, review_priority,
    locked, billing_day, note, position)
    ON public.tracked_subscriptions TO haroteru_subscription_executor;

-- Move the complete atomic operation, rather than exposing a helper that could
-- record caller-supplied success results independently of a data mutation.
ALTER FUNCTION public.apply_subscription_operation(text, text, uuid, jsonb)
    SET SCHEMA subscription_sync_private;
ALTER FUNCTION subscription_sync_private.apply_subscription_operation(text, text, uuid, jsonb)
    SECURITY DEFINER;
ALTER FUNCTION subscription_sync_private.apply_subscription_operation(text, text, uuid, jsonb)
    SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION subscription_sync_private.apply_subscription_operation(text, text, uuid, jsonb)
    SET row_security = on;
REVOKE ALL ON FUNCTION subscription_sync_private.apply_subscription_operation(text, text, uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION subscription_sync_private.apply_subscription_operation(text, text, uuid, jsonb)
    TO authenticated;

-- Non-superuser migration runners need membership and schema CREATE only while
-- assigning ownership. Neither capability remains on the application role.
GRANT haroteru_subscription_executor TO CURRENT_USER;
GRANT CREATE ON SCHEMA subscription_sync_private TO haroteru_subscription_executor;
ALTER FUNCTION subscription_sync_private.apply_subscription_operation(text, text, uuid, jsonb)
    OWNER TO haroteru_subscription_executor;
REVOKE CREATE ON SCHEMA subscription_sync_private FROM haroteru_subscription_executor;
REVOKE haroteru_subscription_executor FROM CURRENT_USER;

CREATE FUNCTION public.apply_subscription_operation(
    operation_id text,
    operation_kind text,
    subscription_id uuid DEFAULT NULL,
    payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT subscription_sync_private.apply_subscription_operation(operation_id, operation_kind, subscription_id, payload);
$$;
REVOKE ALL ON FUNCTION public.apply_subscription_operation(text, text, uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_operation(text, text, uuid, jsonb)
    TO authenticated;

-- Preserve the legacy reorder API without leaving a second privileged path
-- through caller-controlled search_path objects.
CREATE OR REPLACE FUNCTION public.reorder_subscriptions(items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    item jsonb;
    current_user_id uuid := auth.uid();
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(items) LOOP
        UPDATE public.tracked_subscriptions
        SET position = (item ->> 'position')::integer
        WHERE id = (item ->> 'id')::uuid AND user_id = current_user_id;
    END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.reorder_subscriptions(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_subscriptions(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
