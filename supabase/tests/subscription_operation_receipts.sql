BEGIN;
INSERT INTO auth.users(id, email) VALUES
('11111111-1111-4111-8111-111111111111', 'a@example.invalid'),
('22222222-2222-4222-8222-222222222222', 'b@example.invalid');
-- Only the migration/test administrator can seed a historical success that
-- predates today's payload validation. Clients must never create this fixture.
INSERT INTO public.subscription_operation_receipts(user_id, operation_id, request, response)
VALUES ('11111111-1111-4111-8111-111111111111', 'oversized-existing',
    jsonb_build_object('kind', 'create', 'id', NULL, 'payload',
        '{"name":"Music","amountYen":1000,"billingCycle":"monthly","reviewPriority":"medium"}'::jsonb
        || jsonb_build_object('extra', repeat('x', 131073))), '{"historic":true}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

DO $$
DECLARE
    input jsonb := '{"name":"Music","amountYen":1000,"billingCycle":"monthly","reviewPriority":"medium"}';
    created jsonb;
    replayed jsonb;
    item_id uuid;
    reorder_payload jsonb;
    oversized_payload jsonb;
BEGIN
    created := public.apply_subscription_operation('create-1', 'create', NULL, input);
    ASSERT created ->> 'create_operation_id' = 'create-1', 'create response must identify its durable create operation';
    item_id := (created ->> 'id')::uuid;
    replayed := public.apply_subscription_operation('create-1', 'create', NULL, input);
    ASSERT replayed = created, 'lost create response must replay the original result';
    ASSERT (SELECT count(*) FROM public.tracked_subscriptions) = 1, 'create retry duplicated a row';
    ASSERT (SELECT create_operation_id FROM public.tracked_subscriptions WHERE id = item_id) = 'create-1', 'server list must correlate an unacknowledged local create';
    INSERT INTO public.tracked_subscriptions(user_id, name, amount_yen) VALUES (auth.uid(), 'Legacy create', 1);
    ASSERT (SELECT create_operation_id FROM public.tracked_subscriptions WHERE name = 'Legacy create') IS NULL, 'legacy creates must retain nullable metadata';
    DELETE FROM public.tracked_subscriptions WHERE name = 'Legacy create';
    oversized_payload := input || jsonb_build_object('extra', repeat('x', 131073));
    BEGIN
        PERFORM public.apply_subscription_operation('oversized-new', 'create', NULL, oversized_payload);
        RAISE EXCEPTION 'oversized operation payload accepted';
    EXCEPTION WHEN string_data_right_truncation THEN NULL;
    END;
    ASSERT public.apply_subscription_operation('oversized-existing', 'create', NULL, oversized_payload) = '{"historic":true}'::jsonb, 'new size limit rejected an existing receipt';
    BEGIN
        PERFORM public.apply_subscription_operation('create-1', 'create', NULL, input || '{"name":"Other"}');
        RAISE EXCEPTION 'same operation identity accepted a different payload';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    PERFORM public.apply_subscription_operation('update-1', 'update', item_id, '{"name":"First edit"}');
    PERFORM public.apply_subscription_operation('update-2', 'update', item_id, '{"name":"Latest edit"}');
    PERFORM public.apply_subscription_operation('update-1', 'update', item_id, '{"name":"First edit"}');
    ASSERT (SELECT name FROM public.tracked_subscriptions WHERE id = item_id) = 'Latest edit', 'late update retry overwrote newer state';

    reorder_payload := jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', item_id, 'position', 9), jsonb_build_object('id', 'invalid-uuid', 'position', 0)));
    BEGIN
        PERFORM public.apply_subscription_operation('reorder-1', 'reorder', NULL, reorder_payload);
        RAISE EXCEPTION 'invalid second reorder item accepted';
    EXCEPTION WHEN invalid_text_representation THEN NULL;
    END;
    ASSERT (SELECT position FROM public.tracked_subscriptions WHERE id = item_id) = 0, 'partial reorder committed';
    reorder_payload := jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', item_id, 'position', 9)));
    PERFORM public.apply_subscription_operation('reorder-1', 'reorder', NULL, reorder_payload);
    PERFORM public.apply_subscription_operation('reorder-2', 'reorder', NULL, jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', item_id, 'position', 3))));
    PERFORM public.apply_subscription_operation('reorder-1', 'reorder', NULL, reorder_payload);
    ASSERT (SELECT position FROM public.tracked_subscriptions WHERE id = item_id) = 3, 'late reorder replay overwrote newer state';
    PERFORM public.apply_subscription_operation('delete-1', 'delete', item_id);
    PERFORM public.apply_subscription_operation('delete-1', 'delete', item_id);
    PERFORM public.apply_subscription_operation('legacy-already-deleted', 'delete', item_id);
    PERFORM public.apply_subscription_operation('create-1', 'create', NULL, input);
    ASSERT NOT EXISTS (SELECT FROM public.tracked_subscriptions), 'late create resurrected a deleted row';
    PERFORM public.apply_subscription_operation('policy-create', 'create', NULL, input || '{"name":"Policy old"}');
END;
$$;

RESET ROLE;
ALTER TABLE public.tracked_subscriptions ADD CONSTRAINT test_changed_validation CHECK (name <> 'Policy old') NOT VALID;
SET LOCAL ROLE authenticated;
DO $$
DECLARE input jsonb := '{"name":"Policy old","amountYen":1000,"billingCycle":"monthly","reviewPriority":"medium"}';
BEGIN
    ASSERT public.apply_subscription_operation('policy-create', 'create', NULL, input) ->> 'name' = 'Policy old', 'new validation rejected an already committed receipt';
    BEGIN
        PERFORM public.apply_subscription_operation('policy-create-new', 'create', NULL, input);
        RAISE EXCEPTION 'new operation skipped current validation';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
DO $$
DECLARE item_id uuid;
BEGIN
    item_id := (public.apply_subscription_operation('create-1', 'create', NULL, '{"name":"User B","amountYen":2000,"billingCycle":"monthly","reviewPriority":"medium"}') ->> 'id')::uuid;
    ASSERT (SELECT count(*) FROM public.tracked_subscriptions) = 1, 'owner identity collided';
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
    BEGIN
        PERFORM public.apply_subscription_operation('foreign-update', 'update', item_id, '{"name":"Foreign edit"}');
        RAISE EXCEPTION 'foreign row updated';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
    PERFORM public.apply_subscription_operation('foreign-delete', 'delete', item_id);
    PERFORM public.apply_subscription_operation('foreign-reorder', 'reorder', NULL,
        jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', item_id, 'position', 99))));
    BEGIN
        INSERT INTO public.subscription_operation_receipts(user_id, operation_id, request, response)
        VALUES ('22222222-2222-4222-8222-222222222222', 'foreign-receipt', '{}', 'null');
        RAISE EXCEPTION 'foreign receipt inserted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    PERFORM set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
    ASSERT (SELECT name FROM public.tracked_subscriptions WHERE id = item_id) = 'User B', 'foreign mutation changed user B data';
    ASSERT (SELECT position FROM public.tracked_subscriptions WHERE id = item_id) = 0, 'foreign reorder changed user B data';
END;
$$;

-- Test denied operations, not just ACL metadata: even an owner-shaped fake
-- success must fail before it can poison the replay result.
DO $$
BEGIN
    BEGIN
        INSERT INTO public.subscription_operation_receipts(user_id, operation_id, request, response)
        VALUES (auth.uid(), 'forged-own', '{}', '{"fake":true}');
        RAISE EXCEPTION 'authenticated created its own fake success';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        SELECT response FROM public.subscription_operation_receipts WHERE operation_id = 'create-1';
        RAISE EXCEPTION 'authenticated read a receipt directly';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        UPDATE public.subscription_operation_receipts SET response = '{"fake":true}';
        RAISE EXCEPTION 'authenticated rewrote receipts';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        DELETE FROM public.subscription_operation_receipts;
        RAISE EXCEPTION 'authenticated deleted receipts';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    BEGIN
        PERFORM public.apply_subscription_operation('missing-identity', 'delete', NULL);
        RAISE EXCEPTION 'authenticated without identity succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;
SET LOCAL ROLE anon;
DO $$
BEGIN
    BEGIN
        PERFORM public.apply_subscription_operation('anonymous', 'delete', NULL);
        RAISE EXCEPTION 'anonymous RPC call succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        INSERT INTO public.subscription_operation_receipts(user_id, operation_id, request, response)
        VALUES ('11111111-1111-4111-8111-111111111111', 'anonymous-forgery', '{}', 'null');
        RAISE EXCEPTION 'anon inserted a receipt';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        UPDATE public.subscription_operation_receipts SET response = 'null';
        RAISE EXCEPTION 'anon rewrote receipts';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        DELETE FROM public.subscription_operation_receipts;
        RAISE EXCEPTION 'anon deleted receipts';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        PERFORM subscription_sync_private.apply_subscription_operation('anonymous-helper', 'delete', NULL);
        RAISE EXCEPTION 'anon executed the private dispatcher';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

RESET ROLE;
ALTER TABLE public.subscription_operation_receipts ADD CONSTRAINT test_receipt_failure
    CHECK (operation_id <> 'reject-receipt') NOT VALID;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
DO $$
BEGIN
    BEGIN
        PERFORM public.apply_subscription_operation('reject-receipt', 'create', NULL,
            '{"name":"Must roll back","amountYen":1000,"billingCycle":"monthly","reviewPriority":"medium"}');
        RAISE EXCEPTION 'receipt insertion failure did not propagate';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    ASSERT NOT EXISTS (SELECT FROM public.tracked_subscriptions WHERE name = 'Must roll back'), 'receipt failure left a data mutation';
END;
$$;

RESET ROLE;
DO $$
BEGIN
    ASSERT NOT EXISTS (SELECT FROM public.subscription_operation_receipts WHERE operation_id IN
        ('oversized-new', 'policy-create-new', 'foreign-update', 'reject-receipt', 'forged-own', 'anonymous-forgery', 'missing-identity')),
        'a rejected operation left a success receipt';
    ASSERT (SELECT count(*) FROM public.subscription_operation_receipts WHERE operation_id = 'create-1') = 2,
        'user-scoped operation identities collided';
    ASSERT NOT (SELECT rolsuper OR rolbypassrls OR rolcanlogin OR rolcreaterole OR rolcreatedb OR rolinherit OR rolreplication
        FROM pg_roles WHERE rolname = 'haroteru_subscription_executor'), 'executor role has excessive attributes';
    ASSERT NOT EXISTS (SELECT FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'authenticator')
        AND pg_has_role(oid, 'haroteru_subscription_executor', 'MEMBER')), 'client has an executor membership path';
    ASSERT NOT EXISTS (SELECT FROM pg_auth_members WHERE member = 'haroteru_subscription_executor'::regrole),
        'executor inherits another role';
    -- PostgreSQL 16+ may retain an admin-only grant to the CREATEROLE migration
    -- runner, with neither SET nor INHERIT. Runtime membership is forbidden above.
    ASSERT NOT EXISTS (SELECT FROM pg_auth_members WHERE roleid = 'haroteru_subscription_executor'::regrole
        AND (inherit_option OR set_option)), 'executor membership permits runtime use';
    ASSERT NOT EXISTS (SELECT FROM pg_auth_members AS membership
        JOIN pg_roles AS manager ON manager.oid = membership.member
        WHERE membership.roleid = 'haroteru_subscription_executor'::regrole
        AND (NOT membership.admin_option OR NOT manager.rolcreaterole
            OR membership.member <> (SELECT nspowner FROM pg_namespace WHERE nspname = 'subscription_sync_private'))),
        'executor management is granted beyond its trusted migration runner';
    ASSERT NOT EXISTS (SELECT FROM pg_class WHERE oid IN ('public.tracked_subscriptions'::regclass,
        'public.subscription_operation_receipts'::regclass) AND relowner = 'haroteru_subscription_executor'::regrole),
        'executor owns a table and can bypass RLS';
    ASSERT (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.tracked_subscriptions'::regclass,
        'public.subscription_operation_receipts'::regclass)), 'operation tables must retain RLS';
    ASSERT (SELECT NOT prosecdef FROM pg_proc WHERE oid = 'public.apply_subscription_operation(text,text,uuid,jsonb)'::regprocedure),
        'the exposed wrapper must remain invoker';
    ASSERT (SELECT prosecdef AND proowner = 'haroteru_subscription_executor'::regrole
        AND proconfig @> ARRAY['search_path=pg_catalog, pg_temp', 'row_security=on', 'lock_timeout=5s']
        FROM pg_proc WHERE oid = 'subscription_sync_private.apply_subscription_operation(text,text,uuid,jsonb)'::regprocedure),
        'private dispatcher security configuration changed';
    ASSERT NOT has_schema_privilege('authenticated', 'subscription_sync_private', 'CREATE'), 'client can replace private code';
    ASSERT NOT has_schema_privilege('haroteru_subscription_executor', 'subscription_sync_private', 'CREATE'), 'executor can replace private code';
    ASSERT NOT has_table_privilege('haroteru_subscription_executor', 'public.subscription_operation_receipts', 'UPDATE,DELETE'), 'executor can rewrite immutable receipts';
    ASSERT NOT has_column_privilege('haroteru_subscription_executor', 'public.tracked_subscriptions', 'user_id', 'UPDATE'), 'executor can reassign ownership';
    ASSERT NOT has_table_privilege('haroteru_subscription_executor', 'public.profiles', 'SELECT,INSERT,UPDATE,DELETE'), 'executor has unrelated profile access';
END;
$$;

-- The function's owner is still subject to RLS even when a statement accidentally
-- omits its explicit owner predicate.
SET LOCAL ROLE haroteru_subscription_executor;
DO $$
BEGIN
    ASSERT row_security_active('public.subscription_operation_receipts'), 'receipt RLS is bypassed';
    ASSERT row_security_active('public.tracked_subscriptions'), 'subscription RLS is bypassed';
    ASSERT NOT EXISTS (SELECT FROM public.subscription_operation_receipts WHERE user_id <> auth.uid()), 'executor sees foreign receipts';
    ASSERT NOT EXISTS (SELECT FROM public.tracked_subscriptions WHERE user_id <> auth.uid()), 'executor sees foreign subscriptions';
    BEGIN
        INSERT INTO public.subscription_operation_receipts(user_id, operation_id, request, response)
        VALUES ('22222222-2222-4222-8222-222222222222', 'executor-foreign', '{}', 'null');
        RAISE EXCEPTION 'executor inserted foreign receipt';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

RESET ROLE;
DELETE FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111';
DO $$
BEGIN
    ASSERT NOT EXISTS (SELECT FROM public.subscription_operation_receipts WHERE user_id = '11111111-1111-4111-8111-111111111111'), 'account deletion retained receipts';
    ASSERT NOT EXISTS (SELECT FROM public.tracked_subscriptions WHERE user_id = '11111111-1111-4111-8111-111111111111'), 'account deletion retained subscriptions';
    ASSERT EXISTS (SELECT FROM public.subscription_operation_receipts WHERE user_id = '22222222-2222-4222-8222-222222222222'), 'account deletion removed another owner receipts';
END;
$$;
ROLLBACK;
SELECT 'subscription operation receipt regressions passed' AS result;
