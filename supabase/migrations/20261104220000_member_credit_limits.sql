-- Plafond mensuel de crédits par membre d'une organisation.
--
-- L'administrateur d'une organisation répartit le solde commun en fixant, pour certains
-- membres, un plafond de consommation par mois civil (UTC). Sans ligne, le membre consomme
-- librement dans la limite du solde de l'organisation. Le plafond est appliqué dans
-- reserve_tenant_usage, donc pour toute consommation mesurée (génération, voix, médias, chat).
--
-- Annulation : DROP TABLE public.tenant_member_credit_limits, puis rejouer la définition de
-- reserve_tenant_usage de 00056 (sans le bloc « Plafond mensuel du membre »).

CREATE TABLE public.tenant_member_credit_limits (
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  monthly_cap_microunits BIGINT NOT NULL CHECK (monthly_cap_microunits >= 0),
  set_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX tenant_member_credit_limits_user_idx ON public.tenant_member_credit_limits(user_id);

ALTER TABLE public.tenant_member_credit_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_member_credit_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tenant_member_credit_limits TO authenticated;
GRANT ALL ON public.tenant_member_credit_limits TO service_role;

-- Lecture : le membre voit son propre plafond ; les administrateurs et gestionnaires voient
-- ceux de leur organisation. Écriture : serveur seul (service_role).
CREATE POLICY tenant_member_credit_limits_select ON public.tenant_member_credit_limits
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = tenant_member_credit_limits.org_id
        AND m.user_id = (SELECT auth.uid())
        AND m.role = ANY (ARRAY['admin', 'manager'])
    )
  );

-- Consommation du mois civil UTC par membre (débits moins remboursements), pour l'écran de
-- l'administrateur. Lecture seule, service_role.
CREATE FUNCTION public.member_credit_usage_month(p_org_id UUID)
RETURNS TABLE(user_id UUID, spent_microunits BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT l.actor_user_id, coalesce(-sum(l.delta_microunits), 0)::BIGINT
  FROM public.tenant_credit_ledger l
  WHERE l.org_id = p_org_id AND l.entry_type IN ('debit', 'refund')
    AND l.created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
  GROUP BY l.actor_user_id
$$;
REVOKE ALL ON FUNCTION public.member_credit_usage_month(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_credit_usage_month(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_tenant_usage(p_actor uuid, p_org_id uuid, p_operation_key text, p_billable_unit text, p_max_quantity numeric, p_provider_id text, p_model_id text, p_provider_cost_currency text, p_idempotency_stable boolean)
 RETURNS TABLE(enforcement_enabled boolean, reservation_id uuid, reserved_credit_microunits bigint, applied boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE control public.tenant_billing_controls;
DECLARE tenant_burn public.tenant_credit_burn_rates;
DECLARE platform_burn public.platform_credit_burn_rates;
DECLARE existing public.tenant_usage_reservations;
DECLARE created public.tenant_usage_reservations;
DECLARE posted RECORD;
DECLARE reserve_amount BIGINT;
DECLARE rate_credit BIGINT;
DECLARE rate_basis NUMERIC;
DECLARE fingerprint TEXT;
DECLARE member_cap BIGINT;
DECLARE member_spent BIGINT;
BEGIN
  SELECT * INTO control FROM public.tenant_billing_controls WHERE org_id = p_org_id;
  IF NOT FOUND OR NOT control.enforcement_enabled THEN
    RETURN QUERY SELECT false, NULL::UUID, 0::BIGINT, false;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id AND status = 'active')
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
    OR NOT p_idempotency_stable
    OR NOT (p_billable_unit = ANY(control.required_units))
    OR char_length(p_operation_key) NOT BETWEEN 8 AND 160
    OR p_max_quantity <= 0 OR p_max_quantity <> round(p_max_quantity, 6)
    OR char_length(trim(p_provider_id)) NOT BETWEEN 1 AND 120
    OR char_length(trim(p_model_id)) NOT BETWEEN 1 AND 200
    OR upper(p_provider_cost_currency) !~ '^[A-Z]{3}$'
  THEN RAISE EXCEPTION 'INVALID_USAGE_RESERVATION' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::TEXT || '|' || p_operation_key, 0));
  fingerprint := jsonb_build_object(
    'unit', p_billable_unit, 'max_quantity', p_max_quantity,
    'provider', trim(p_provider_id), 'model', trim(p_model_id),
    'cost_currency', upper(p_provider_cost_currency)
  )::TEXT;
  SELECT * INTO existing FROM public.tenant_usage_reservations
  WHERE org_id = p_org_id AND operation_key = p_operation_key;
  IF FOUND THEN
    IF existing.request_fingerprint <> fingerprint
    THEN RAISE EXCEPTION 'USAGE_RESERVATION_IDEMPOTENCY_MISMATCH' USING ERRCODE = '22023'; END IF;
    RETURN QUERY SELECT true, existing.id, existing.reserved_credit_microunits, false;
    RETURN;
  END IF;
  SELECT * INTO tenant_burn FROM public.tenant_credit_burn_rates
  WHERE org_id = p_org_id AND billable_unit = p_billable_unit
    AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
  ORDER BY valid_from DESC LIMIT 1;
  IF FOUND THEN
    rate_credit := tenant_burn.credit_microunits;
    rate_basis := tenant_burn.quantity_basis;
  ELSE
    SELECT * INTO platform_burn FROM public.platform_credit_burn_rates
    WHERE billable_unit = p_billable_unit
      AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
    ORDER BY valid_from DESC LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'GLOBAL_CREDIT_BURN_RATE_NOT_FOUND:%', p_billable_unit
        USING ERRCODE = 'P0002';
    END IF;
    rate_credit := platform_burn.credit_microunits;
    rate_basis := platform_burn.quantity_basis;
  END IF;
  reserve_amount := greatest(1, ceil((p_max_quantity / rate_basis) * rate_credit))::BIGINT;
  -- Plafond mensuel du membre (fixé par l'administrateur de l'organisation) : sa consommation du
  -- mois civil UTC, réservations comprises, plus cette réservation, ne le dépasse jamais. Le refus
  -- réutilise le code de solde insuffisant, que toutes les routes de consommation traduisent déjà.
  SELECT monthly_cap_microunits INTO member_cap FROM public.tenant_member_credit_limits
  WHERE org_id = p_org_id AND user_id = p_actor;
  IF FOUND THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('member-cap|' || p_org_id::TEXT || '|' || p_actor::TEXT, 0));
    SELECT coalesce(-sum(delta_microunits), 0)::BIGINT INTO member_spent
    FROM public.tenant_credit_ledger
    WHERE org_id = p_org_id AND actor_user_id = p_actor
      AND entry_type IN ('debit', 'refund')
      AND created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    IF member_spent + reserve_amount > member_cap THEN
      RAISE EXCEPTION 'INSUFFICIENT_TENANT_CREDITS:MEMBER_CAP' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  SELECT * INTO posted FROM public.post_tenant_credit_entry(
    p_actor, p_org_id, 'debit', -reserve_amount,
    'meter-reserve:' || p_operation_key, 'Réservation de consommation fournisseur',
    p_billable_unit, p_max_quantity, 'reserve:' || p_operation_key, NULL
  );
  INSERT INTO public.tenant_usage_reservations(
    org_id, actor_user_id, operation_key, request_fingerprint,
    billable_unit, max_quantity, provider_id, model_id,
    sell_currency, provider_cost_currency, burn_rate_id, platform_burn_rate_id,
    reserved_credit_microunits, reservation_debit_id
  ) VALUES (
    p_org_id, p_actor, p_operation_key, fingerprint,
    p_billable_unit, p_max_quantity, trim(p_provider_id), trim(p_model_id),
    control.sell_currency, upper(p_provider_cost_currency),
    tenant_burn.id, platform_burn.id, reserve_amount, posted.ledger_id
  ) RETURNING * INTO created;
  RETURN QUERY SELECT true, created.id, reserve_amount, posted.applied;
END;
$function$;
