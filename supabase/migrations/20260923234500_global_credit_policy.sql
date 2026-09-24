-- S6-030 — Global, versioned credit policy with tenant overrides and
-- economically independent usage settlement.

CREATE TABLE public.platform_credit_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anchor_currency TEXT NOT NULL CHECK (anchor_currency = 'USD'),
  anchor_cost_microunits BIGINT NOT NULL CHECK (anchor_cost_microunits = 10000),
  calibration_method TEXT NOT NULL CHECK (char_length(trim(calibration_method)) BETWEEN 1 AND 1000),
  rationale TEXT NOT NULL CHECK (char_length(trim(rationale)) BETWEEN 1 AND 1000),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ CHECK (valid_to IS NULL OR valid_to > valid_from),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_credit_burn_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.platform_credit_policies(id),
  billable_unit TEXT NOT NULL CHECK (billable_unit IN (
    'llm_input_token', 'llm_output_token', 'tts_second', 'asr_second',
    'image', 'video_second', 'storage_byte', 'operation'
  )),
  credit_microunits BIGINT NOT NULL CHECK (credit_microunits > 0),
  quantity_basis NUMERIC(24, 6) NOT NULL CHECK (quantity_basis > 0),
  settlement_mode TEXT NOT NULL CHECK (settlement_mode IN ('measured_actual', 'p95_flat_rate')),
  reservation_percentile NUMERIC(5, 2) NOT NULL DEFAULT 95
    CHECK (reservation_percentile BETWEEN 50 AND 100),
  observation_window_days INTEGER NOT NULL CHECK (observation_window_days BETWEEN 1 AND 366),
  provenance TEXT NOT NULL CHECK (char_length(trim(provenance)) BETWEEN 1 AND 1000),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ CHECK (valid_to IS NULL OR valid_to > valid_from),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX platform_credit_policy_current_idx
  ON public.platform_credit_policies((anchor_currency)) WHERE valid_to IS NULL;
CREATE UNIQUE INDEX platform_credit_burn_rate_current_idx
  ON public.platform_credit_burn_rates(billable_unit) WHERE valid_to IS NULL;
CREATE INDEX platform_credit_burn_rate_lookup_idx
  ON public.platform_credit_burn_rates(billable_unit, valid_from DESC);

ALTER TABLE public.platform_credit_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_credit_burn_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_credit_policies FROM anon, authenticated;
REVOKE ALL ON TABLE public.platform_credit_burn_rates FROM anon, authenticated;
GRANT ALL ON TABLE public.platform_credit_policies TO service_role;
GRANT ALL ON TABLE public.platform_credit_burn_rates TO service_role;

CREATE TRIGGER protect_platform_credit_policy_version
  BEFORE UPDATE OR DELETE ON public.platform_credit_policies
  FOR EACH ROW EXECUTE FUNCTION public.protect_economic_version();
CREATE TRIGGER protect_platform_credit_burn_rate_version
  BEFORE UPDATE OR DELETE ON public.platform_credit_burn_rates
  FOR EACH ROW EXECUTE FUNCTION public.protect_economic_version();

ALTER TABLE public.tenant_billing_controls
  ADD COLUMN activation_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (activation_source IN ('system', 'manual')),
  ADD COLUMN suspension_reason TEXT
    CHECK (suspension_reason IS NULL OR char_length(trim(suspension_reason)) BETWEEN 1 AND 500);

DO $$
DECLARE constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.tenant_billing_controls'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%enabled_by%enabled_at%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tenant_billing_controls DROP CONSTRAINT %I', constraint_name);
  END IF;
END;
$$;

ALTER TABLE public.tenant_billing_controls
  ADD CONSTRAINT tenant_billing_controls_activation_check CHECK (
    (enforcement_enabled AND (
      (activation_source = 'system' AND suspension_reason IS NULL)
      OR (activation_source = 'manual' AND enabled_by IS NOT NULL AND enabled_at IS NOT NULL
        AND suspension_reason IS NULL)
    ))
    OR (NOT enforcement_enabled AND suspension_reason IS NOT NULL)
  );

INSERT INTO public.tenant_billing_controls(
  org_id, enforcement_enabled, sell_currency, required_units,
  enabled_by, enabled_at, updated_by, activation_source, suspension_reason
)
SELECT organizations.id,
(SELECT count(*) = 8 FROM public.platform_credit_burn_rates WHERE valid_to IS NULL),
'MAD', ARRAY[
  'llm_input_token', 'llm_output_token', 'tts_second', 'asr_second',
  'image', 'video_second', 'storage_byte', 'operation'
]::TEXT[], NULL, clock_timestamp(),
COALESCE(
  (SELECT members.user_id FROM public.org_members AS members
    WHERE members.org_id = organizations.id ORDER BY members.created_at LIMIT 1),
  (SELECT profiles.id FROM public.profiles ORDER BY profiles.created_at LIMIT 1)
), 'system', CASE
  WHEN (SELECT count(*) = 8 FROM public.platform_credit_burn_rates WHERE valid_to IS NULL)
    THEN NULL
  ELSE 'GLOBAL_CREDIT_POLICY_INCOMPLETE'
END
FROM public.organizations
WHERE organizations.status = 'active'
ON CONFLICT (org_id) DO UPDATE SET
  enforcement_enabled = EXCLUDED.enforcement_enabled,
  required_units = EXCLUDED.required_units,
  activation_source = 'system',
  suspension_reason = CASE WHEN EXCLUDED.enforcement_enabled THEN NULL
    ELSE 'GLOBAL_CREDIT_POLICY_INCOMPLETE' END,
  updated_at = clock_timestamp();

UPDATE public.tenant_billing_controls
SET suspension_reason = 'GLOBAL_CREDIT_POLICY_INCOMPLETE'
WHERE NOT enforcement_enabled AND suspension_reason IS NULL;

CREATE OR REPLACE FUNCTION public.initialize_tenant_usage_billing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE system_actor UUID;
BEGIN
  SELECT profiles.id INTO system_actor FROM public.profiles ORDER BY profiles.created_at LIMIT 1;
  IF system_actor IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.tenant_credit_wallets(org_id) VALUES (NEW.id)
  ON CONFLICT (org_id) DO NOTHING;
  INSERT INTO public.tenant_billing_controls(
    org_id, enforcement_enabled, sell_currency, required_units,
    enabled_by, enabled_at, updated_by, activation_source, suspension_reason
  ) VALUES (
    NEW.id,
    NEW.status = 'active' AND (
      SELECT count(*) = 8 FROM public.platform_credit_burn_rates WHERE valid_to IS NULL
    ),
    'MAD', ARRAY[
      'llm_input_token', 'llm_output_token', 'tts_second', 'asr_second',
      'image', 'video_second', 'storage_byte', 'operation'
    ]::TEXT[], NULL, clock_timestamp(), system_actor, 'system',
    CASE WHEN (
      SELECT count(*) = 8 FROM public.platform_credit_burn_rates WHERE valid_to IS NULL
    ) THEN NULL ELSE 'GLOBAL_CREDIT_POLICY_INCOMPLETE' END
  ) ON CONFLICT (org_id) DO NOTHING;
  UPDATE public.tenant_billing_controls
  SET suspension_reason = 'GLOBAL_CREDIT_POLICY_INCOMPLETE'
  WHERE org_id = NEW.id AND NOT enforcement_enabled AND suspension_reason IS NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER initialize_tenant_usage_billing
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.initialize_tenant_usage_billing();

ALTER TABLE public.tenant_usage_reservations
  ALTER COLUMN burn_rate_id DROP NOT NULL,
  ALTER COLUMN sell_price_id DROP NOT NULL,
  ALTER COLUMN provider_cost_rate_id DROP NOT NULL,
  ADD COLUMN platform_burn_rate_id UUID REFERENCES public.platform_credit_burn_rates(id),
  ADD COLUMN valuation_status TEXT NOT NULL DEFAULT 'pending_configuration'
    CHECK (valuation_status IN ('pending_configuration', 'valued', 'not_applicable')),
  ADD COLUMN valuation_issue TEXT
    CHECK (valuation_issue IS NULL OR char_length(trim(valuation_issue)) BETWEEN 1 AND 500),
  ADD CONSTRAINT tenant_usage_reservations_one_burn_rate CHECK (
    (burn_rate_id IS NOT NULL)::INTEGER + (platform_burn_rate_id IS NOT NULL)::INTEGER = 1
  );

ALTER TABLE public.tenant_usage_reservations DISABLE TRIGGER protect_usage_reservation;
UPDATE public.tenant_usage_reservations
SET valuation_status = CASE status
  WHEN 'settled' THEN 'valued'
  WHEN 'released' THEN 'not_applicable'
  ELSE 'pending_configuration'
END;
ALTER TABLE public.tenant_usage_reservations ENABLE TRIGGER protect_usage_reservation;

CREATE OR REPLACE FUNCTION public.protect_usage_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.status = 'reserved'
    AND NEW.status IN ('settled', 'released')
    AND (to_jsonb(NEW) - ARRAY[
      'status', 'actual_quantity', 'actual_credit_microunits',
      'reservation_refund_id', 'actual_debit_id', 'valued_usage_id',
      'sell_price_id', 'provider_cost_rate_id', 'exchange_rate_id',
      'valuation_status', 'valuation_issue', 'release_reason', 'settled_at'
    ]) = (to_jsonb(OLD) - ARRAY[
      'status', 'actual_quantity', 'actual_credit_microunits',
      'reservation_refund_id', 'actual_debit_id', 'valued_usage_id',
      'sell_price_id', 'provider_cost_rate_id', 'exchange_rate_id',
      'valuation_status', 'valuation_issue', 'release_reason', 'settled_at'
    ])
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'USAGE_RESERVATION_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

DO $$
DECLARE constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.tenant_usage_reservations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%valued_usage_id IS NOT NULL%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.tenant_usage_reservations DROP CONSTRAINT %I',
      constraint_record.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE public.tenant_usage_reservations
  ADD CONSTRAINT tenant_usage_reservations_lifecycle_check CHECK (
    (status = 'reserved' AND actual_quantity IS NULL AND actual_credit_microunits IS NULL
      AND reservation_refund_id IS NULL AND actual_debit_id IS NULL
      AND valued_usage_id IS NULL AND release_reason IS NULL AND settled_at IS NULL)
    OR (status = 'released' AND actual_quantity IS NULL AND actual_credit_microunits IS NULL
      AND reservation_refund_id IS NOT NULL AND actual_debit_id IS NULL
      AND valued_usage_id IS NULL AND release_reason IS NOT NULL AND settled_at IS NOT NULL
      AND valuation_status = 'not_applicable')
    OR (status = 'settled' AND actual_quantity IS NOT NULL AND actual_credit_microunits IS NOT NULL
      AND reservation_refund_id IS NOT NULL AND actual_debit_id IS NOT NULL
      AND release_reason IS NULL AND settled_at IS NOT NULL
      AND (
        (valuation_status = 'valued' AND valued_usage_id IS NOT NULL AND valuation_issue IS NULL)
        OR (valuation_status = 'pending_configuration' AND valued_usage_id IS NULL
          AND valuation_issue IS NOT NULL)
      ))
  );

CREATE OR REPLACE FUNCTION public.create_platform_credit_policy(
  p_actor UUID,
  p_calibration_method TEXT,
  p_rationale TEXT,
  p_valid_from TIMESTAMPTZ
)
RETURNS public.platform_credit_policies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE created public.platform_credit_policies;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
    OR char_length(trim(p_calibration_method)) NOT BETWEEN 1 AND 1000
    OR char_length(trim(p_rationale)) NOT BETWEEN 1 AND 1000
  THEN RAISE EXCEPTION 'INVALID_CREDIT_POLICY' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('platform-credit-policy', 0));
  UPDATE public.platform_credit_policies SET valid_to = p_valid_from
  WHERE valid_to IS NULL AND valid_from < p_valid_from;
  IF EXISTS (
    SELECT 1 FROM public.platform_credit_policies
    WHERE valid_to IS NULL OR valid_to > p_valid_from
  ) THEN RAISE EXCEPTION 'CREDIT_POLICY_PERIOD_OVERLAP' USING ERRCODE = '23P01'; END IF;
  INSERT INTO public.platform_credit_policies(
    anchor_currency, anchor_cost_microunits, calibration_method,
    rationale, valid_from, created_by
  ) VALUES ('USD', 10000, trim(p_calibration_method), trim(p_rationale), p_valid_from, p_actor)
  RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_platform_credit_burn_rate(
  p_actor UUID,
  p_policy_id UUID,
  p_billable_unit TEXT,
  p_credit_microunits BIGINT,
  p_quantity_basis NUMERIC,
  p_settlement_mode TEXT,
  p_observation_window_days INTEGER,
  p_provenance TEXT,
  p_valid_from TIMESTAMPTZ
)
RETURNS public.platform_credit_burn_rates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE created public.platform_credit_burn_rates;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
    OR NOT EXISTS (SELECT 1 FROM public.platform_credit_policies WHERE id = p_policy_id)
    OR p_credit_microunits <= 0 OR p_quantity_basis <= 0
    OR p_settlement_mode NOT IN ('measured_actual', 'p95_flat_rate')
    OR p_observation_window_days NOT BETWEEN 1 AND 366
    OR char_length(trim(p_provenance)) NOT BETWEEN 1 AND 1000
  THEN RAISE EXCEPTION 'INVALID_PLATFORM_CREDIT_BURN_RATE' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_billable_unit || '|platform-credit-burn', 0));
  UPDATE public.platform_credit_burn_rates SET valid_to = p_valid_from
  WHERE billable_unit = p_billable_unit AND valid_to IS NULL AND valid_from < p_valid_from;
  IF EXISTS (
    SELECT 1 FROM public.platform_credit_burn_rates
    WHERE billable_unit = p_billable_unit AND (valid_to IS NULL OR valid_to > p_valid_from)
  ) THEN RAISE EXCEPTION 'PLATFORM_CREDIT_BURN_PERIOD_OVERLAP' USING ERRCODE = '23P01'; END IF;
  INSERT INTO public.platform_credit_burn_rates(
    policy_id, billable_unit, credit_microunits, quantity_basis,
    settlement_mode, observation_window_days, provenance, valid_from, created_by
  ) VALUES (
    p_policy_id, p_billable_unit, p_credit_microunits, p_quantity_basis,
    p_settlement_mode, p_observation_window_days, trim(p_provenance), p_valid_from, p_actor
  ) RETURNING * INTO created;
  IF (SELECT count(*) = 8 FROM public.platform_credit_burn_rates WHERE valid_to IS NULL) THEN
    UPDATE public.tenant_billing_controls
    SET enforcement_enabled = true,
      activation_source = 'system',
      suspension_reason = NULL,
      updated_by = p_actor,
      enabled_by = p_actor,
      enabled_at = clock_timestamp(),
      updated_at = clock_timestamp();
  END IF;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.configure_tenant_billing(
  p_actor UUID,
  p_org_id UUID,
  p_enabled BOOLEAN,
  p_sell_currency TEXT,
  p_required_units TEXT[]
)
RETURNS public.tenant_billing_controls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE configured public.tenant_billing_controls;
DECLARE missing_unit TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
    OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id)
  THEN RAISE EXCEPTION 'INVALID_BILLING_ACTOR_OR_TENANT' USING ERRCODE = '42501'; END IF;
  IF p_required_units IS NULL OR cardinality(p_required_units) = 0
    OR EXISTS (
      SELECT 1 FROM unnest(p_required_units) AS unit
      WHERE unit NOT IN (
        'llm_input_token', 'llm_output_token', 'tts_second', 'asr_second',
        'image', 'video_second', 'storage_byte', 'operation'
      )
    )
  THEN RAISE EXCEPTION 'INVALID_REQUIRED_BILLING_UNITS' USING ERRCODE = '22023'; END IF;
  IF p_enabled THEN
    SELECT unit INTO missing_unit FROM unnest(p_required_units) AS unit
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tenant_credit_burn_rates AS tenant_rate
      WHERE tenant_rate.org_id = p_org_id AND tenant_rate.billable_unit = unit
        AND tenant_rate.valid_from <= now()
        AND (tenant_rate.valid_to IS NULL OR tenant_rate.valid_to > now())
    ) AND NOT EXISTS (
      SELECT 1 FROM public.platform_credit_burn_rates AS platform_rate
      WHERE platform_rate.billable_unit = unit AND platform_rate.valid_from <= now()
        AND (platform_rate.valid_to IS NULL OR platform_rate.valid_to > now())
    ) LIMIT 1;
    IF missing_unit IS NOT NULL THEN
      RAISE EXCEPTION 'INCOMPLETE_CREDIT_POLICY_COVERAGE:%', missing_unit
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO public.tenant_billing_controls(
    org_id, enforcement_enabled, sell_currency, required_units,
    enabled_by, enabled_at, updated_by, activation_source, suspension_reason
  ) VALUES (
    p_org_id, p_enabled, upper(p_sell_currency),
    ARRAY(SELECT DISTINCT unit FROM unnest(p_required_units) AS unit ORDER BY unit),
    CASE WHEN p_enabled THEN p_actor ELSE NULL END,
    CASE WHEN p_enabled THEN clock_timestamp() ELSE NULL END,
    p_actor, 'manual',
    CASE WHEN p_enabled THEN NULL ELSE 'Suspension manuelle par le super-administrateur' END
  ) ON CONFLICT (org_id) DO UPDATE SET
    enforcement_enabled = EXCLUDED.enforcement_enabled,
    sell_currency = EXCLUDED.sell_currency,
    required_units = EXCLUDED.required_units,
    enabled_by = EXCLUDED.enabled_by,
    enabled_at = EXCLUDED.enabled_at,
    updated_by = EXCLUDED.updated_by,
    activation_source = EXCLUDED.activation_source,
    suspension_reason = EXCLUDED.suspension_reason,
    updated_at = clock_timestamp()
  RETURNING * INTO configured;
  RETURN configured;
END;
$$;

-- Tenant overrides remain explicit, temporal versions. Returning to inheritance
-- closes only the active override; it never deletes economic history.
CREATE OR REPLACE FUNCTION public.inherit_platform_credit_burn_rate(
  p_actor UUID,
  p_org_id UUID,
  p_billable_unit TEXT,
  p_valid_from TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE changed INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
    OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id)
  THEN RAISE EXCEPTION 'INVALID_BILLING_ACTOR_OR_TENANT' USING ERRCODE = '42501'; END IF;
  UPDATE public.tenant_credit_burn_rates SET valid_to = p_valid_from
  WHERE org_id = p_org_id AND billable_unit = p_billable_unit
    AND valid_to IS NULL AND valid_from < p_valid_from;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_tenant_usage(
  p_actor UUID,
  p_org_id UUID,
  p_operation_key TEXT,
  p_billable_unit TEXT,
  p_max_quantity NUMERIC,
  p_provider_id TEXT,
  p_model_id TEXT,
  p_provider_cost_currency TEXT,
  p_idempotency_stable BOOLEAN
)
RETURNS TABLE(
  enforcement_enabled BOOLEAN,
  reservation_id UUID,
  reserved_credit_microunits BIGINT,
  applied BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

DROP FUNCTION public.settle_tenant_usage(UUID, UUID, NUMERIC);

CREATE FUNCTION public.settle_tenant_usage(
  p_actor UUID,
  p_reservation_id UUID,
  p_actual_quantity NUMERIC
)
RETURNS TABLE(
  reservation_id UUID,
  actual_credit_microunits BIGINT,
  valued_usage_id UUID,
  revenue_microunits BIGINT,
  cost_microunits BIGINT,
  margin_bps INTEGER,
  below_target BOOLEAN,
  valuation_status TEXT,
  valuation_issue TEXT,
  applied BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE reservation public.tenant_usage_reservations;
DECLARE tenant_burn public.tenant_credit_burn_rates;
DECLARE platform_burn public.platform_credit_burn_rates;
DECLARE price public.tenant_sell_prices;
DECLARE cost_rate public.provider_cost_rates;
DECLARE fx public.currency_exchange_rates;
DECLARE existing_valuation public.valued_billable_usage;
DECLARE created_valuation public.valued_billable_usage;
DECLARE refund_entry RECORD;
DECLARE actual_entry RECORD;
DECLARE actual_credit_amount BIGINT;
DECLARE rate_credit BIGINT;
DECLARE rate_basis NUMERIC;
DECLARE native_cost BIGINT;
DECLARE converted_cost BIGINT;
DECLARE revenue BIGINT;
DECLARE gross BIGINT;
DECLARE margin INTEGER;
DECLARE target INTEGER;
DECLARE issue TEXT;
DECLARE fingerprint TEXT;
BEGIN
  SELECT * INTO reservation FROM public.tenant_usage_reservations
  WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USAGE_RESERVATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF reservation.actor_user_id <> p_actor
  THEN RAISE EXCEPTION 'USAGE_RESERVATION_ACTOR_MISMATCH' USING ERRCODE = '42501'; END IF;
  IF reservation.status = 'released'
  THEN RAISE EXCEPTION 'USAGE_RESERVATION_ALREADY_RELEASED' USING ERRCODE = '55000'; END IF;
  IF reservation.status = 'settled' THEN
    IF p_actual_quantity <> reservation.actual_quantity
    THEN RAISE EXCEPTION 'USAGE_SETTLEMENT_IDEMPOTENCY_MISMATCH' USING ERRCODE = '22023'; END IF;
    IF reservation.valued_usage_id IS NOT NULL THEN
      SELECT * INTO existing_valuation FROM public.valued_billable_usage
      WHERE id = reservation.valued_usage_id;
    END IF;
    RETURN QUERY SELECT reservation.id, reservation.actual_credit_microunits,
      existing_valuation.id, existing_valuation.revenue_microunits,
      existing_valuation.cost_microunits, existing_valuation.margin_bps,
      CASE WHEN existing_valuation.id IS NULL THEN NULL
        ELSE existing_valuation.margin_bps < existing_valuation.target_margin_bps END,
      reservation.valuation_status, reservation.valuation_issue, false;
    RETURN;
  END IF;
  IF p_actual_quantity <= 0 OR p_actual_quantity > reservation.max_quantity
    OR p_actual_quantity <> round(p_actual_quantity, 6)
  THEN RAISE EXCEPTION 'INVALID_ACTUAL_USAGE_QUANTITY' USING ERRCODE = '22023'; END IF;

  IF reservation.burn_rate_id IS NOT NULL THEN
    SELECT * INTO tenant_burn FROM public.tenant_credit_burn_rates WHERE id = reservation.burn_rate_id;
    rate_credit := tenant_burn.credit_microunits;
    rate_basis := tenant_burn.quantity_basis;
  ELSE
    SELECT * INTO platform_burn FROM public.platform_credit_burn_rates
    WHERE id = reservation.platform_burn_rate_id;
    rate_credit := platform_burn.credit_microunits;
    rate_basis := platform_burn.quantity_basis;
  END IF;
  IF rate_credit IS NULL OR rate_basis IS NULL
  THEN RAISE EXCEPTION 'RESERVED_CREDIT_BURN_VERSION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO refund_entry FROM public.post_tenant_credit_entry(
    p_actor, reservation.org_id, 'refund', reservation.reserved_credit_microunits,
    'meter-refund:' || reservation.operation_key,
    'Libération de la réservation de consommation fournisseur',
    NULL, NULL, NULL, reservation.reservation_debit_id
  );
  actual_credit_amount := greatest(1, ceil(
    (p_actual_quantity / rate_basis) * rate_credit
  ))::BIGINT;
  SELECT * INTO actual_entry FROM public.post_tenant_credit_entry(
    p_actor, reservation.org_id, 'debit', -actual_credit_amount,
    'meter-actual:' || reservation.operation_key,
    'Consommation fournisseur mesurée', reservation.billable_unit,
    p_actual_quantity, 'actual:' || reservation.operation_key, NULL
  );

  SELECT * INTO price FROM public.tenant_sell_prices
  WHERE org_id = reservation.org_id AND billable_unit = reservation.billable_unit
    AND currency = reservation.sell_currency
    AND valid_from <= reservation.created_at
    AND (valid_to IS NULL OR valid_to > reservation.created_at)
  ORDER BY valid_from DESC LIMIT 1;
  IF NOT FOUND THEN issue := 'SELL_PRICE_NOT_FOUND'; END IF;
  SELECT * INTO cost_rate FROM public.provider_cost_rates
  WHERE provider_id = reservation.provider_id AND model_id = reservation.model_id
    AND billable_unit = reservation.billable_unit
    AND currency = reservation.provider_cost_currency
    AND valid_from <= reservation.created_at
    AND (valid_to IS NULL OR valid_to > reservation.created_at)
  ORDER BY valid_from DESC LIMIT 1;
  IF NOT FOUND THEN issue := concat_ws(',', issue, 'PROVIDER_COST_NOT_FOUND'); END IF;
  IF price.id IS NOT NULL AND cost_rate.id IS NOT NULL AND cost_rate.currency <> price.currency THEN
    SELECT * INTO fx FROM public.currency_exchange_rates
    WHERE base_currency = cost_rate.currency AND quote_currency = price.currency
      AND valid_from <= reservation.created_at
      AND (valid_to IS NULL OR valid_to > reservation.created_at)
    ORDER BY valid_from DESC LIMIT 1;
    IF NOT FOUND THEN issue := concat_ws(',', issue, 'EXCHANGE_RATE_NOT_FOUND'); END IF;
  END IF;

  IF issue IS NOT NULL THEN
    UPDATE public.tenant_usage_reservations SET
      status = 'settled', actual_quantity = p_actual_quantity,
      actual_credit_microunits = actual_credit_amount,
      reservation_refund_id = refund_entry.ledger_id,
      actual_debit_id = actual_entry.ledger_id,
      valuation_status = 'pending_configuration', valuation_issue = issue,
      settled_at = clock_timestamp()
    WHERE id = reservation.id;
    RETURN QUERY SELECT reservation.id, actual_credit_amount, NULL::UUID,
      NULL::BIGINT, NULL::BIGINT, NULL::INTEGER, NULL::BOOLEAN,
      'pending_configuration'::TEXT, issue, true;
    RETURN;
  END IF;

  revenue := round((p_actual_quantity / price.quantity_basis) * price.price_microunits)::BIGINT;
  native_cost := round((p_actual_quantity / cost_rate.quantity_basis) * cost_rate.cost_microunits)::BIGINT;
  IF revenue <= 0 THEN RAISE EXCEPTION 'VALUATION_BELOW_MICROUNIT' USING ERRCODE = '22003'; END IF;
  converted_cost := CASE WHEN cost_rate.currency = price.currency THEN native_cost
    ELSE round((native_cost::NUMERIC * fx.rate_nanos) / 1000000000)::BIGINT END;
  gross := revenue - converted_cost;
  margin := round((gross::NUMERIC / revenue) * 10000)::INTEGER;
  SELECT targets.target_margin_bps INTO target FROM public.margin_target_versions AS targets
  WHERE targets.effective_at <= reservation.created_at ORDER BY targets.effective_at DESC LIMIT 1;
  target := COALESCE(target, 9500);
  fingerprint := jsonb_build_object(
    'reservation_id', reservation.id, 'sell_price_id', price.id,
    'provider_cost_rate_id', cost_rate.id, 'exchange_rate_id', fx.id,
    'actual_quantity', p_actual_quantity
  )::TEXT;
  INSERT INTO public.valued_billable_usage(
    org_id, credit_ledger_id, billable_unit, quantity, sell_price_id,
    provider_cost_rate_id, exchange_rate_id, sell_currency, provider_id, model_id,
    provider_cost_currency, revenue_microunits, provider_cost_native_microunits,
    cost_microunits, gross_margin_microunits, margin_bps, target_margin_bps,
    valuation_fingerprint, valued_by
  ) VALUES (
    reservation.org_id, actual_entry.ledger_id, reservation.billable_unit,
    p_actual_quantity, price.id, cost_rate.id, fx.id, price.currency,
    reservation.provider_id, reservation.model_id, cost_rate.currency, revenue,
    native_cost, converted_cost, gross, margin, target, fingerprint, p_actor
  ) RETURNING * INTO created_valuation;
  UPDATE public.tenant_usage_reservations SET
    status = 'settled', actual_quantity = p_actual_quantity,
    actual_credit_microunits = actual_credit_amount,
    reservation_refund_id = refund_entry.ledger_id,
    actual_debit_id = actual_entry.ledger_id,
    valued_usage_id = created_valuation.id,
    sell_price_id = price.id, provider_cost_rate_id = cost_rate.id,
    exchange_rate_id = fx.id, valuation_status = 'valued', valuation_issue = NULL,
    settled_at = clock_timestamp()
  WHERE id = reservation.id;
  RETURN QUERY SELECT reservation.id, actual_credit_amount, created_valuation.id,
    revenue, converted_cost, margin, margin < target, 'valued'::TEXT, NULL::TEXT, true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_tenant_usage(
  p_actor UUID,
  p_reservation_id UUID,
  p_reason TEXT
)
RETURNS TABLE(
  reservation_id UUID,
  refunded_credit_microunits BIGINT,
  balance_microunits BIGINT,
  applied BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE reservation public.tenant_usage_reservations;
DECLARE refund_entry RECORD;
DECLARE current_balance BIGINT;
BEGIN
  SELECT * INTO reservation FROM public.tenant_usage_reservations
  WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USAGE_RESERVATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF reservation.actor_user_id <> p_actor
  THEN RAISE EXCEPTION 'USAGE_RESERVATION_ACTOR_MISMATCH' USING ERRCODE = '42501'; END IF;
  IF reservation.status = 'settled'
  THEN RAISE EXCEPTION 'USAGE_RESERVATION_ALREADY_SETTLED' USING ERRCODE = '55000'; END IF;
  IF reservation.status = 'released' THEN
    SELECT wallets.balance_microunits INTO current_balance
    FROM public.tenant_credit_wallets AS wallets WHERE wallets.org_id = reservation.org_id;
    RETURN QUERY SELECT reservation.id, reservation.reserved_credit_microunits,
      current_balance, false;
    RETURN;
  END IF;
  IF char_length(trim(p_reason)) NOT BETWEEN 1 AND 500
  THEN RAISE EXCEPTION 'INVALID_USAGE_RELEASE_REASON' USING ERRCODE = '22023'; END IF;
  SELECT * INTO refund_entry FROM public.post_tenant_credit_entry(
    p_actor, reservation.org_id, 'refund', reservation.reserved_credit_microunits,
    'meter-refund:' || reservation.operation_key,
    'Libération de la réservation de consommation fournisseur',
    NULL, NULL, NULL, reservation.reservation_debit_id
  );
  UPDATE public.tenant_usage_reservations SET
    status = 'released', reservation_refund_id = refund_entry.ledger_id,
    release_reason = trim(p_reason), valuation_status = 'not_applicable',
    valuation_issue = NULL, settled_at = clock_timestamp()
  WHERE id = reservation.id;
  RETURN QUERY SELECT reservation.id, reservation.reserved_credit_microunits,
    refund_entry.balance_microunits, true;
END;
$$;

-- Existing active tenants inherit the platform rule without changing wallets.
-- An anchor is safe to seed because its value was explicitly approved; burn
-- rates are deliberately not invented and must be measured before activation.
INSERT INTO public.platform_credit_policies(
  anchor_currency, anchor_cost_microunits, calibration_method,
  rationale, valid_from, created_by
)
SELECT 'USD', 10000,
  'Coût complet mesuré ; règlement réel pour les usages variables et percentile 95 pour les plafonds et forfaits.',
  'Un crédit représente 0,01 USD de capacité de coût interne de référence et ne détermine jamais le prix de vente.',
  clock_timestamp(), profiles.id
FROM public.profiles AS profiles
ORDER BY profiles.created_at
LIMIT 1
ON CONFLICT DO NOTHING;

REVOKE ALL ON FUNCTION public.initialize_tenant_usage_billing() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_platform_credit_policy(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_platform_credit_burn_rate(UUID, UUID, TEXT, BIGINT, NUMERIC, TEXT, INTEGER, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inherit_platform_credit_burn_rate(UUID, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_platform_credit_policy(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_platform_credit_burn_rate(UUID, UUID, TEXT, BIGINT, NUMERIC, TEXT, INTEGER, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.inherit_platform_credit_burn_rate(UUID, UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_tenant_usage(UUID, UUID, NUMERIC) TO service_role;
