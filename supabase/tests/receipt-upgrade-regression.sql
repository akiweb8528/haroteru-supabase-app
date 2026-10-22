BEGIN;
SELECT set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE replayed jsonb;
BEGIN
    replayed := public.apply_subscription_operation('upgrade-create', 'create', NULL,
        '{"name":"Before hardening","amountYen":1000,"billingCycle":"monthly","reviewPriority":"medium"}');
    ASSERT replayed ->> 'name' = 'Before hardening', 'upgrade changed the original response';
    ASSERT (SELECT count(*) FROM public.tracked_subscriptions) = 1, 'upgrade replay duplicated or lost data';
    ASSERT (SELECT id FROM public.tracked_subscriptions) = (replayed ->> 'id')::uuid, 'upgrade replaced the existing subscription';
END;
$$;
RESET ROLE;
DELETE FROM auth.users WHERE id = '77777777-7777-4777-8777-777777777777';
COMMIT;
