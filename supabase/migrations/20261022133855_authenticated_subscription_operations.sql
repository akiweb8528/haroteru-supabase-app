ALTER TABLE public.tracked_subscriptions ADD COLUMN create_operation_id varchar(128);

-- Keep receipts independently of the subscription lifecycle: a delayed create
-- retry after deletion must return its receipt without recreating the row.
CREATE TABLE public.subscription_operation_receipts (
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    operation_id varchar(128) NOT NULL CHECK (operation_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
    request jsonb NOT NULL,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, operation_id)
);

ALTER TABLE public.subscription_operation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_operation_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.subscription_operation_receipts TO authenticated;
CREATE POLICY operation_receipts_select_own ON public.subscription_operation_receipts
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY operation_receipts_insert_own ON public.subscription_operation_receipts
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE FUNCTION public.apply_subscription_operation(
    operation_id text,
    operation_kind text,
    subscription_id uuid DEFAULT NULL,
    payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
    owner_id uuid := auth.uid();
    operation_request jsonb;
    receipt public.subscription_operation_receipts%ROWTYPE;
    item public.tracked_subscriptions%ROWTYPE;
    reorder_item jsonb;
    result jsonb := 'null'::jsonb;
BEGIN
    IF owner_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF operation_id IS NULL OR operation_id !~ '^[a-zA-Z0-9_-]{1,128}$' THEN
        RAISE EXCEPTION 'invalid_operation_id' USING ERRCODE = '22023';
    END IF;
    operation_request := jsonb_build_object('kind', operation_kind, 'id', subscription_id, 'payload', payload);
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text || ':' || operation_id, 0));
    SELECT * INTO receipt FROM public.subscription_operation_receipts AS receipts
    WHERE receipts.user_id = owner_id AND receipts.operation_id = apply_subscription_operation.operation_id;
    IF FOUND THEN
        IF receipt.request <> operation_request THEN
            RAISE EXCEPTION 'operation_conflict' USING ERRCODE = '22023';
        END IF;
        RETURN receipt.response;
    END IF;

    IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
        RAISE EXCEPTION 'invalid_operation_payload' USING ERRCODE = '22023';
    END IF;
    IF octet_length(payload::text) > 131072 THEN
        RAISE EXCEPTION 'operation_payload_too_large' USING ERRCODE = '22001';
    END IF;

    CASE operation_kind
    WHEN 'create' THEN
        INSERT INTO public.tracked_subscriptions (
            user_id, name, amount_yen, billing_cycle, category, review_priority,
            locked, billing_day, note, position, create_operation_id
        ) VALUES (
            owner_id, payload ->> 'name', (payload ->> 'amountYen')::integer,
            (payload ->> 'billingCycle')::public.billing_cycle,
            (payload ->> 'category')::public.subscription_category,
            (payload ->> 'reviewPriority')::public.review_priority,
            COALESCE((payload ->> 'locked')::boolean, false),
            (payload ->> 'billingDay')::smallint, COALESCE(payload ->> 'note', ''),
            (SELECT COALESCE(max(position), -1) + 1 FROM public.tracked_subscriptions WHERE user_id = owner_id),
            operation_id
        ) RETURNING * INTO item;
        result := to_jsonb(item);
    WHEN 'update' THEN
        UPDATE public.tracked_subscriptions SET
            name = CASE WHEN payload ? 'name' THEN payload ->> 'name' ELSE name END,
            amount_yen = CASE WHEN payload ? 'amountYen' THEN (payload ->> 'amountYen')::integer ELSE amount_yen END,
            billing_cycle = CASE WHEN payload ? 'billingCycle' THEN (payload ->> 'billingCycle')::public.billing_cycle ELSE billing_cycle END,
            category = CASE WHEN COALESCE((payload ->> 'clearCategory')::boolean, false) THEN NULL
                WHEN payload ? 'category' THEN (payload ->> 'category')::public.subscription_category ELSE category END,
            review_priority = CASE WHEN payload ? 'reviewPriority' THEN (payload ->> 'reviewPriority')::public.review_priority ELSE review_priority END,
            locked = CASE WHEN payload ? 'locked' THEN (payload ->> 'locked')::boolean ELSE locked END,
            billing_day = CASE WHEN COALESCE((payload ->> 'clearBillingDay')::boolean, false) THEN NULL
                WHEN payload ? 'billingDay' THEN (payload ->> 'billingDay')::smallint ELSE billing_day END,
            note = CASE WHEN payload ? 'note' THEN payload ->> 'note' ELSE note END
        WHERE id = subscription_id AND user_id = owner_id
        RETURNING * INTO item;
        IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found' USING ERRCODE = 'P0002'; END IF;
        result := to_jsonb(item);
    WHEN 'delete' THEN
        DELETE FROM public.tracked_subscriptions WHERE id = subscription_id AND user_id = owner_id;
    WHEN 'reorder' THEN
        IF jsonb_typeof(payload -> 'items') IS DISTINCT FROM 'array' OR jsonb_array_length(payload -> 'items') > 1000 THEN
            RAISE EXCEPTION 'invalid_reorder_items' USING ERRCODE = '22023';
        END IF;
        FOR reorder_item IN SELECT * FROM jsonb_array_elements(payload -> 'items') LOOP
            IF (reorder_item ->> 'position') IS NULL OR (reorder_item ->> 'position')::integer < 0 OR (reorder_item ->> 'id') IS NULL THEN
                RAISE EXCEPTION 'invalid_reorder_item' USING ERRCODE = '22023';
            END IF;
            UPDATE public.tracked_subscriptions SET position = (reorder_item ->> 'position')::integer
            WHERE id = (reorder_item ->> 'id')::uuid AND user_id = owner_id;
        END LOOP;
    ELSE
        RAISE EXCEPTION 'invalid_operation_kind' USING ERRCODE = '22023';
    END CASE;
    INSERT INTO public.subscription_operation_receipts (user_id, operation_id, request, response)
    VALUES (owner_id, operation_id, operation_request, result);
    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_subscription_operation(text, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_subscription_operation(text, text, uuid, jsonb) TO authenticated;
