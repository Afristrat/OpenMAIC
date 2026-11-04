-- Test du plafond mensuel par membre. À jouer APRÈS la migration 20261104220000, dans une transaction
-- annulée, sur une base qui contient une organisation avec mesure active et un membre :
--   BEGIN; \i migrations/20261104220000_member_credit_limits.sql; \i tests/member_credit_limits.sql; ROLLBACK;

DO $$
DECLARE
  org UUID; member UUID; other UUID;
  refused BOOLEAN; res RECORD;
BEGIN
  SELECT c.org_id, m.user_id INTO org, member
  FROM public.tenant_billing_controls c
  JOIN public.org_members m ON m.org_id = c.org_id
  WHERE c.enforcement_enabled AND 'llm_input_token' = ANY(c.required_units)
  ORDER BY m.created_at LIMIT 1;
  IF org IS NULL THEN RAISE EXCEPTION 'TEST_SANS_ORGANISATION_MESUREE'; END IF;

  -- 1) Plafond à 1 micro-unité : la réservation est refusée avec le code de solde insuffisant.
  INSERT INTO public.tenant_member_credit_limits(org_id, user_id, monthly_cap_microunits, set_by)
  VALUES (org, member, 1, member);
  refused := false;
  BEGIN
    PERFORM * FROM public.reserve_tenant_usage(member, org, 'cap-test-refuse-0001', 'llm_input_token', 1000, 'test', 'test', 'USD', true);
  EXCEPTION WHEN OTHERS THEN
    refused := SQLERRM LIKE 'INSUFFICIENT_TENANT_CREDITS%';
  END;
  IF NOT refused THEN RAISE EXCEPTION 'ECHEC: plafond dépassé non refusé'; END IF;

  -- 2) Plafond très large : la même réservation passe, et une réservation est bien créée.
  UPDATE public.tenant_member_credit_limits SET monthly_cap_microunits = 1000000000000
  WHERE org_id = org AND user_id = member;
  SELECT * INTO res FROM public.reserve_tenant_usage(member, org, 'cap-test-accepte-0001', 'llm_input_token', 1000, 'test', 'test', 'USD', true);
  IF res.reservation_id IS NULL THEN RAISE EXCEPTION 'ECHEC: réservation sous plafond refusée'; END IF;

  -- 3) Sans ligne de plafond : la consommation reste libre (limitée par le solde seul).
  DELETE FROM public.tenant_member_credit_limits WHERE org_id = org AND user_id = member;
  SELECT * INTO res FROM public.reserve_tenant_usage(member, org, 'cap-test-libre-00001', 'llm_input_token', 1000, 'test', 'test', 'USD', true);
  IF res.reservation_id IS NULL THEN RAISE EXCEPTION 'ECHEC: réservation sans plafond refusée'; END IF;

  -- 4) Le plafond d'un membre ne touche pas un autre membre.
  SELECT user_id INTO other FROM public.org_members WHERE org_id = org AND user_id <> member LIMIT 1;
  INSERT INTO public.tenant_member_credit_limits(org_id, user_id, monthly_cap_microunits, set_by)
  VALUES (org, member, 1, member);
  IF other IS NOT NULL THEN
    SELECT * INTO res FROM public.reserve_tenant_usage(other, org, 'cap-test-autre-00001', 'llm_input_token', 1000, 'test', 'test', 'USD', true);
    IF res.reservation_id IS NULL THEN RAISE EXCEPTION 'ECHEC: plafond d''un membre appliqué à un autre'; END IF;
  END IF;

  RAISE NOTICE 'PLAFONDS PAR MEMBRE OK';
END;
$$;
