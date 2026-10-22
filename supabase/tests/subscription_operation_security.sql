BEGIN;
INSERT INTO auth.users(id, email) VALUES
    ('44444444-4444-4444-8444-444444444444', 'shadowing@example.invalid');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);

-- A fresh connection compiles the dispatcher with attacker-controlled temporary
-- types/tables already present. A catalog-first path must ignore every shadow.
CREATE TEMP TABLE tracked_subscriptions (poison boolean);
CREATE TEMP TABLE subscription_operation_receipts (poison boolean);
CREATE DOMAIN pg_temp.uuid AS pg_catalog.uuid CHECK (false);
CREATE DOMAIN pg_temp.jsonb AS pg_catalog.jsonb CHECK (false);
DO $$
DECLARE
    created pg_catalog.jsonb;
BEGIN
    created := public.apply_subscription_operation('shadow-create', 'create', NULL,
        '{"name":"Safe paths","amountYen":1000,"billingCycle":"monthly","reviewPriority":"medium"}');
    ASSERT created ->> 'user_id' = '44444444-4444-4444-8444-444444444444', 'dispatcher changed owner';
    PERFORM public.apply_subscription_operation('shadow-update', 'update',
        (created ->> 'id')::pg_catalog.uuid, '{"name":"Safe edit"}');
    PERFORM public.reorder_subscriptions(jsonb_build_array(jsonb_build_object('id', created ->> 'id', 'position', 4)));
    -- The fixture's auth.uid() also runs from RLS in the following caller-side
    -- query, outside either function's scoped configuration.
    PERFORM set_config('search_path', 'pg_catalog, pg_temp', true);
    ASSERT (SELECT position FROM public.tracked_subscriptions WHERE id = (created ->> 'id')::pg_catalog.uuid) = 4,
        'legacy reorder did not update the real table';
    ASSERT (SELECT count(*) FROM pg_temp.tracked_subscriptions) = 0, 'temporary table intercepted a write';
    ASSERT (SELECT count(*) FROM pg_temp.subscription_operation_receipts) = 0, 'temporary receipt table intercepted a write';
    ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.reorder_subscriptions(jsonb)'::regprocedure),
        'legacy reorder still elevates privileges';
    ASSERT NOT has_function_privilege('anon', 'public.reorder_subscriptions(jsonb)', 'EXECUTE'),
        'legacy reorder is exposed anonymously';
END;
$$;
ROLLBACK;
SELECT 'subscription operation security regressions passed' AS result;
