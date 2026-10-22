BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT public.apply_subscription_operation('concurrent-' || :'operation_kind', :'operation_kind',
    CASE WHEN :'operation_kind' = 'reorder' THEN NULL ELSE :'item_id'::uuid END,
    CASE :'operation_kind'
        WHEN 'update' THEN '{"name":"Concurrent edit"}'::jsonb
        WHEN 'reorder' THEN jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', :'item_id', 'position', 7)))
        ELSE '{}'::jsonb
    END);
COMMIT;
