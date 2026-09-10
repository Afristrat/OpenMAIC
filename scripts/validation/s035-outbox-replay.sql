-- Synthetic outbox rows only, always rolled back; no queue or LRS is contacted.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE tenant uuid; original jsonb;
BEGIN
  SELECT id INTO STRICT tenant FROM public.organizations ORDER BY id LIMIT 1;
  INSERT INTO public.xapi_outbox(id, org_id, dedupe_key, statement, lrs_target)
    OVERRIDING SYSTEM VALUE VALUES (-9035001, tenant, 's035-proof-first-write', '{"proof":"first"}', 'https://first.invalid');
  SELECT to_jsonb(o) INTO original FROM public.xapi_outbox o WHERE id = -9035001;
  INSERT INTO public.xapi_outbox(id, org_id, dedupe_key, statement, lrs_target)
    OVERRIDING SYSTEM VALUE VALUES (-9035002, tenant, 's035-proof-first-write', '{"proof":"replacement"}', 'https://replacement.invalid')
    ON CONFLICT (org_id, dedupe_key) DO NOTHING;
  IF (SELECT count(*) FROM public.xapi_outbox WHERE dedupe_key = 's035-proof-first-write' AND org_id = tenant) <> 1
    OR (SELECT to_jsonb(o) FROM public.xapi_outbox o WHERE id = -9035001) IS DISTINCT FROM original THEN
    RAISE EXCEPTION 'Replay changed the first durable event';
  END IF;
  RAISE NOTICE 'First payload, destination, timestamp and status preserved';
END $$;
ROLLBACK;
SELECT count(*) AS remaining_proof_rows FROM public.xapi_outbox WHERE id IN (-9035001, -9035002);
