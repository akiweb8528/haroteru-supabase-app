BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT public.apply_subscription_operation('concurrent-create', 'create', NULL,
    '{"name":"Concurrent","amountYen":1000,"billingCycle":"monthly","reviewPriority":"medium"}');
COMMIT;
