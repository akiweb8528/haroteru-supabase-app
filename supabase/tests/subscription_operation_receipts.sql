BEGIN;
INSERT INTO auth.users(id, email) VALUES
('11111111-1111-4111-8111-111111111111', 'a@example.invalid'),
('22222222-2222-4222-8222-222222222222', 'b@example.invalid');
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
    ASSERT NOT EXISTS (SELECT FROM public.subscription_operation_receipts WHERE operation_id = 'oversized-new'), 'oversized request left a receipt';
    INSERT INTO public.subscription_operation_receipts(user_id, operation_id, request, response)
    VALUES (auth.uid(), 'oversized-existing', jsonb_build_object('kind', 'create', 'id', NULL, 'payload', oversized_payload), created);
    ASSERT public.apply_subscription_operation('oversized-existing', 'create', NULL, oversized_payload) = created, 'new size limit rejected an existing receipt';
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
    ASSERT NOT EXISTS (SELECT FROM public.subscription_operation_receipts WHERE operation_id = 'reorder-1'), 'failed mutation left a receipt';
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
    ASSERT NOT has_table_privilege(current_user, 'public.subscription_operation_receipts', 'DELETE'), 'receipts can be deleted by the client';
    ASSERT NOT has_table_privilege(current_user, 'public.subscription_operation_receipts', 'UPDATE'), 'receipts can be rewritten by the client';
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
    ASSERT NOT EXISTS (SELECT FROM public.subscription_operation_receipts WHERE operation_id = 'policy-create-new'), 'validation rejection left a receipt';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
DO $$
DECLARE item_id uuid;
BEGIN
    ASSERT NOT EXISTS (SELECT FROM public.subscription_operation_receipts), 'another user can see receipts';
    item_id := (public.apply_subscription_operation('create-1', 'create', NULL, '{"name":"User B","amountYen":2000,"billingCycle":"monthly","reviewPriority":"medium"}') ->> 'id')::uuid;
    ASSERT (SELECT count(*) FROM public.tracked_subscriptions) = 1, 'owner identity collided';
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
    BEGIN
        PERFORM public.apply_subscription_operation('foreign-update', 'update', item_id, '{"name":"Foreign edit"}');
        RAISE EXCEPTION 'foreign row updated';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
    PERFORM public.apply_subscription_operation('foreign-delete', 'delete', item_id);
    BEGIN
        INSERT INTO public.subscription_operation_receipts(user_id, operation_id, request, response)
        VALUES ('22222222-2222-4222-8222-222222222222', 'foreign-receipt', '{}', 'null');
        RAISE EXCEPTION 'foreign receipt inserted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    PERFORM set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
    ASSERT (SELECT name FROM public.tracked_subscriptions WHERE id = item_id) = 'User B', 'foreign mutation changed user B data';
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
END;
$$;
ROLLBACK;
SELECT 'subscription operation receipt regressions passed' AS result;
