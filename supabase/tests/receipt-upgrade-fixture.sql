BEGIN;
INSERT INTO auth.users(id, email) VALUES
    ('77777777-7777-4777-8777-777777777777', 'upgrade@example.invalid');
SELECT set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', true);
SET LOCAL ROLE authenticated;
SELECT public.apply_subscription_operation('upgrade-create', 'create', NULL,
    '{"name":"Before hardening","amountYen":1000,"billingCycle":"monthly","reviewPriority":"medium"}');
COMMIT;
