-- S6-025 — Real provider usage reservations, settlement and compensation.

CREATE TABLE public.tenant_billing_controls (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enforcement_enabled BOOLEAN NOT NULL DEFAULT false,
  sell_currency TEXT NOT NULL CHECK (sell_currency ~ '^[A-Z]{3}$'),
  required_units TEXT[] NOT NULL CHECK (
    cardinality(required_units) > 0
    AND required_units <@ ARRAY[
      'llm_input_token', 'llm_output_token', 'tts_second', 'asr_second',
      'image', 'video_second', 'storage_byte', 'operation'
    ]::TEXT[]
  ),
  enabled_by UUID,
  enabled_at TIMESTAMPTZ,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (NOT enforcement_enabled AND enabled_by IS NULL AND enabled_at IS NULL)
    OR (enforcement_enabled AND enabled_by IS NOT NULL AND enabled_at IS NOT NULL)
  )
);

CREATE TABLE public.tenant_credit_burn_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  billable_unit TEXT NOT NULL CHECK (billable_unit IN (
    'llm_input_token', 'llm_output_token', 'tts_second', 'asr_second',
    'image', 'video_second', 'storage_byte', 'operation'
  )),
  credit_microunits BIGINT NOT NULL CHECK (credit_microunits > 0),
  quantity_basis NUMERIC(24, 6) NOT NULL CHECK (quantity_basis > 0),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ CHECK (valid_to IS NULL OR valid_to > valid_from),
  rationale TEXT NOT NULL CHECK (char_length(trim(rationale)) BETWEEN 1 AND 1000),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tenant_usage_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL,
  operation_key TEXT NOT NULL CHECK (char_length(operation_key) BETWEEN 8 AND 160),
  request_fingerprint TEXT NOT NULL,
  billable_unit TEXT NOT NULL,
  max_quantity NUMERIC(24, 6) NOT NULL CHECK (max_quantity > 0),
  actual_quantity NUMERIC(24, 6) CHECK (actual_quantity > 0 AND actual_quantity <= max_quantity),
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  sell_currency TEXT NOT NULL CHECK (sell_currency ~ '^[A-Z]{3}$'),
  provider_cost_currency TEXT NOT NULL CHECK (provider_cost_currency ~ '^[A-Z]{3}$'),
  burn_rate_id UUID NOT NULL REFERENCES public.tenant_credit_burn_rates(id),
  sell_price_id UUID NOT NULL REFERENCES public.tenant_sell_prices(id),
  provider_cost_rate_id UUID NOT NULL REFERENCES public.provider_cost_rates(id),
  exchange_rate_id UUID REFERENCES public.currency_exchange_rates(id),
  reserved_credit_microunits BIGINT NOT NULL CHECK (reserved_credit_microunits > 0),
  actual_credit_microunits BIGINT CHECK (actual_credit_microunits > 0),
  reservation_debit_id UUID NOT NULL UNIQUE REFERENCES public.tenant_credit_ledger(id),
  reservation_refund_id UUID UNIQUE REFERENCES public.tenant_credit_ledger(id),
  actual_debit_id UUID UNIQUE REFERENCES public.tenant_credit_ledger(id),
  valued_usage_id UUID UNIQUE REFERENCES public.valued_billable_usage(id),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'released')),
  release_reason TEXT CHECK (release_reason IS NULL OR char_length(trim(release_reason)) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  UNIQUE (org_id, operation_key),
  CHECK (
    (status = 'reserved' AND actual_quantity IS NULL AND actual_credit_microunits IS NULL
      AND reservation_refund_id IS NULL AND actual_debit_id IS NULL
      AND valued_usage_id IS NULL AND release_reason IS NULL AND settled_at IS NULL)
    OR (status = 'released' AND actual_quantity IS NULL AND actual_credit_microunits IS NULL
      AND reservation_refund_id IS NOT NULL AND actual_debit_id IS NULL
      AND valued_usage_id IS NULL AND release_reason IS NOT NULL AND settled_at IS NOT NULL)
    OR (status = 'settled' AND actual_quantity IS NOT NULL AND actual_credit_microunits IS NOT NULL
      AND reservation_refund_id IS NOT NULL AND actual_debit_id IS NOT NULL
      AND valued_usage_id IS NOT NULL AND release_reason IS NULL AND settled_at IS NOT NULL)
  )
);

CREATE INDEX tenant_credit_burn_rates_lookup_idx
  ON public.tenant_credit_burn_rates(org_id, billable_unit, valid_from DESC);
CREATE INDEX tenant_usage_reservations_status_idx
  ON public.tenant_usage_reservations(org_id, status, created_at DESC);

ALTER TABLE public.tenant_billing_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_credit_burn_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usage_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_billing_controls FROM anon, authenticated;
REVOKE ALL ON TABLE public.tenant_credit_burn_rates FROM anon, authenticated;
REVOKE ALL ON TABLE public.tenant_usage_reservations FROM anon, authenticated;
GRANT ALL ON TABLE public.tenant_billing_controls TO service_role;
GRANT ALL ON TABLE public.tenant_credit_burn_rates TO service_role;
GRANT ALL ON TABLE public.tenant_usage_reservations TO service_role;

CREATE TRIGGER protect_tenant_credit_burn_rate_version
  BEFORE UPDATE OR DELETE ON public.tenant_credit_burn_rates
  FOR EACH ROW EXECUTE FUNCTION public.protect_economic_version();

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
      'release_reason', 'settled_at'
    ]) = (to_jsonb(OLD) - ARRAY[
      'status', 'actual_quantity', 'actual_credit_microunits',
      'reservation_refund_id', 'actual_debit_id', 'valued_usage_id',
      'release_reason', 'settled_at'
    ])
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'USAGE_RESERVATION_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER protect_usage_reservation
  BEFORE UPDATE OR DELETE ON public.tenant_usage_reservations
  FOR EACH ROW EXECUTE FUNCTION public.protect_usage_reservation();

CREATE OR REPLACE FUNCTION public.create_tenant_credit_burn_rate(
  p_actor UUID,
  p_org_id UUID,
  p_billable_unit TEXT,
  p_credit_microunits BIGINT,
  p_quantity_basis NUMERIC,
  p_valid_from TIMESTAMPTZ,
  p_rationale TEXT
)
RETURNS public.tenant_credit_burn_rates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE created public.tenant_credit_burn_rates;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
    OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id)
  THEN RAISE EXCEPTION 'INVALID_BILLING_ACTOR_OR_TENANT' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_org_id::TEXT || '|' || p_billable_unit || '|credit-burn', 0
  ));
  UPDATE public.tenant_credit_burn_rates SET valid_to = p_valid_from
  WHERE org_id = p_org_id AND billable_unit = p_billable_unit
    AND valid_to IS NULL AND valid_from < p_valid_from;
  IF EXISTS (
    SELECT 1 FROM public.tenant_credit_burn_rates
    WHERE org_id = p_org_id AND billable_unit = p_billable_unit
      AND (valid_to IS NULL OR valid_to > p_valid_from)
  ) THEN RAISE EXCEPTION 'CREDIT_BURN_PERIOD_OVERLAP' USING ERRCODE = '23P01'; END IF;
  INSERT INTO public.tenant_credit_burn_rates(
    org_id, billable_unit, credit_microunits, quantity_basis,
    valid_from, rationale, created_by
  ) VALUES (
    p_org_id, p_billable_unit, p_credit_microunits, p_quantity_basis,
    p_valid_from, trim(p_rationale), p_actor
  ) RETURNING * INTO created;
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
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::TEXT || '|billing-control', 0));
  IF p_enabled THEN
    SELECT unit INTO missing_unit FROM unnest(p_required_units) AS unit
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tenant_credit_burn_rates AS burn
      WHERE burn.org_id = p_org_id AND burn.billable_unit = unit
        AND burn.valid_from <= now() AND (burn.valid_to IS NULL OR burn.valid_to > now())
    ) OR NOT EXISTS (
      SELECT 1 FROM public.tenant_sell_prices AS price
      WHERE price.org_id = p_org_id AND price.billable_unit = unit
        AND price.currency = upper(p_sell_currency)
        AND price.valid_from <= now() AND (price.valid_to IS NULL OR price.valid_to > now())
    ) LIMIT 1;
    IF missing_unit IS NOT NULL THEN
      RAISE EXCEPTION 'INCOMPLETE_TENANT_BILLING_COVERAGE:%', missing_unit
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO public.tenant_billing_controls(
    org_id, enforcement_enabled, sell_currency, required_units,
    enabled_by, enabled_at, updated_by
  ) VALUES (
    p_org_id, p_enabled, upper(p_sell_currency),
    ARRAY(SELECT DISTINCT unit FROM unnest(p_required_units) AS unit ORDER BY unit),
    CASE WHEN p_enabled THEN p_actor ELSE NULL END,
    CASE WHEN p_enabled THEN clock_timestamp() ELSE NULL END,
    p_actor
  ) ON CONFLICT (org_id) DO UPDATE SET
    enforcement_enabled = EXCLUDED.enforcement_enabled,
    sell_currency = EXCLUDED.sell_currency,
    required_units = EXCLUDED.required_units,
    enabled_by = EXCLUDED.enabled_by,
    enabled_at = EXCLUDED.enabled_at,
    updated_by = EXCLUDED.updated_by,
    updated_at = clock_timestamp()
  RETURNING * INTO configured;
  RETURN configured;
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
DECLARE burn public.tenant_credit_burn_rates;
DECLARE price public.tenant_sell_prices;
DECLARE cost_rate public.provider_cost_rates;
DECLARE fx public.currency_exchange_rates;
DECLARE existing public.tenant_usage_reservations;
DECLARE created public.tenant_usage_reservations;
DECLARE posted RECORD;
DECLARE reserve_amount BIGINT;
DECLARE fingerprint TEXT;
BEGIN
  SELECT * INTO control FROM public.tenant_billing_controls WHERE org_id = p_org_id;
  IF NOT FOUND OR NOT control.enforcement_enabled THEN
    RETURN QUERY SELECT false, NULL::UUID, 0::BIGINT, false;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
    OR NOT p_idempotency_stable
    OR NOT (p_billable_unit = ANY(control.required_units))
    OR char_length(p_operation_key) NOT BETWEEN 8 AND 160
    OR p_max_quantity <= 0 OR p_max_quantity <> round(p_max_quantity, 6)
    OR char_length(trim(p_provider_id)) NOT BETWEEN 1 AND 120
    OR char_length(trim(p_model_id)) NOT BETWEEN 1 AND 200
    OR upper(p_provider_cost_currency) !~ '^[A-Z]{3}$'
  THEN RAISE EXCEPTION 'INVALID_USAGE_RESERVATION' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_org_id::TEXT || '|' || p_operation_key, 0
  ));
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
  SELECT * INTO burn FROM public.tenant_credit_burn_rates
  WHERE org_id = p_org_id AND billable_unit = p_billable_unit
    AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
  ORDER BY valid_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'CREDIT_BURN_RATE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO price FROM public.tenant_sell_prices
  WHERE org_id = p_org_id AND billable_unit = p_billable_unit
    AND currency = control.sell_currency
    AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
  ORDER BY valid_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SELL_PRICE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO cost_rate FROM public.provider_cost_rates
  WHERE provider_id = trim(p_provider_id) AND model_id = trim(p_model_id)
    AND billable_unit = p_billable_unit AND currency = upper(p_provider_cost_currency)
    AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
  ORDER BY valid_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROVIDER_COST_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF cost_rate.currency <> price.currency THEN
    SELECT * INTO fx FROM public.currency_exchange_rates
    WHERE base_currency = cost_rate.currency AND quote_currency = price.currency
      AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
    ORDER BY valid_from DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'EXCHANGE_RATE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  END IF;
  reserve_amount := greatest(1, ceil(
    (p_max_quantity / burn.quantity_basis) * burn.credit_microunits
  ))::BIGINT;
  SELECT * INTO posted FROM public.post_tenant_credit_entry(
    p_actor, p_org_id, 'debit', -reserve_amount,
    'meter-reserve:' || p_operation_key, 'Réservation de consommation fournisseur',
    p_billable_unit, p_max_quantity, 'reserve:' || p_operation_key, NULL
  );
  INSERT INTO public.tenant_usage_reservations(
    org_id, actor_user_id, operation_key, request_fingerprint,
    billable_unit, max_quantity, provider_id, model_id,
    sell_currency, provider_cost_currency, burn_rate_id, sell_price_id,
    provider_cost_rate_id, exchange_rate_id, reserved_credit_microunits,
    reservation_debit_id
  ) VALUES (
    p_org_id, p_actor, p_operation_key, fingerprint,
    p_billable_unit, p_max_quantity, trim(p_provider_id), trim(p_model_id),
    price.currency, cost_rate.currency, burn.id, price.id,
    cost_rate.id, CASE WHEN cost_rate.currency = price.currency THEN NULL ELSE fx.id END,
    reserve_amount, posted.ledger_id
  ) RETURNING * INTO created;
  RETURN QUERY SELECT true, created.id, reserve_amount, posted.applied;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_tenant_usage(
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
  applied BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE reservation public.tenant_usage_reservations;
DECLARE price public.tenant_sell_prices;
DECLARE cost_rate public.provider_cost_rates;
DECLARE fx public.currency_exchange_rates;
DECLARE existing_valuation public.valued_billable_usage;
DECLARE created_valuation public.valued_billable_usage;
DECLARE refund_entry RECORD;
DECLARE actual_entry RECORD;
DECLARE actual_credit_amount BIGINT;
DECLARE native_cost BIGINT;
DECLARE converted_cost BIGINT;
DECLARE revenue BIGINT;
DECLARE gross BIGINT;
DECLARE margin INTEGER;
DECLARE target INTEGER;
DECLARE fingerprint TEXT;
BEGIN
  SELECT * INTO reservation
  FROM public.tenant_usage_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USAGE_RESERVATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF reservation.actor_user_id <> p_actor THEN
    RAISE EXCEPTION 'USAGE_RESERVATION_ACTOR_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF reservation.status = 'released' THEN
    RAISE EXCEPTION 'USAGE_RESERVATION_ALREADY_RELEASED' USING ERRCODE = '55000';
  END IF;
  IF reservation.status = 'settled' THEN
    IF p_actual_quantity <> reservation.actual_quantity THEN
      RAISE EXCEPTION 'USAGE_SETTLEMENT_IDEMPOTENCY_MISMATCH' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO existing_valuation
    FROM public.valued_billable_usage
    WHERE id = reservation.valued_usage_id;
    RETURN QUERY SELECT reservation.id, reservation.actual_credit_microunits,
      existing_valuation.id, existing_valuation.revenue_microunits,
      existing_valuation.cost_microunits, existing_valuation.margin_bps,
      existing_valuation.margin_bps < existing_valuation.target_margin_bps, false;
    RETURN;
  END IF;
  IF p_actual_quantity <= 0
    OR p_actual_quantity > reservation.max_quantity
    OR p_actual_quantity <> round(p_actual_quantity, 6)
  THEN
    RAISE EXCEPTION 'INVALID_ACTUAL_USAGE_QUANTITY' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO price FROM public.tenant_sell_prices
  WHERE id = reservation.sell_price_id AND org_id = reservation.org_id;
  SELECT * INTO cost_rate FROM public.provider_cost_rates
  WHERE id = reservation.provider_cost_rate_id;
  IF price.id IS NULL OR cost_rate.id IS NULL THEN
    RAISE EXCEPTION 'RESERVED_ECONOMIC_VERSION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF reservation.exchange_rate_id IS NOT NULL THEN
    SELECT * INTO fx FROM public.currency_exchange_rates
    WHERE id = reservation.exchange_rate_id;
    IF fx.id IS NULL THEN
      RAISE EXCEPTION 'RESERVED_EXCHANGE_RATE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT * INTO refund_entry FROM public.post_tenant_credit_entry(
    p_actor, reservation.org_id, 'refund', reservation.reserved_credit_microunits,
    'meter-refund:' || reservation.operation_key,
    'Libération de la réservation de consommation fournisseur',
    NULL, NULL, NULL, reservation.reservation_debit_id
  );

  actual_credit_amount := greatest(1, ceil(
    (p_actual_quantity / (
      SELECT quantity_basis FROM public.tenant_credit_burn_rates
      WHERE id = reservation.burn_rate_id
    )) * (
      SELECT credit_microunits FROM public.tenant_credit_burn_rates
      WHERE id = reservation.burn_rate_id
    )
  ))::BIGINT;
  SELECT * INTO actual_entry FROM public.post_tenant_credit_entry(
    p_actor, reservation.org_id, 'debit', -actual_credit_amount,
    'meter-actual:' || reservation.operation_key,
    'Consommation fournisseur mesurée', reservation.billable_unit,
    p_actual_quantity, 'actual:' || reservation.operation_key, NULL
  );

  revenue := round(
    (p_actual_quantity / price.quantity_basis) * price.price_microunits
  )::BIGINT;
  native_cost := round(
    (p_actual_quantity / cost_rate.quantity_basis) * cost_rate.cost_microunits
  )::BIGINT;
  IF revenue <= 0 THEN
    RAISE EXCEPTION 'VALUATION_BELOW_MICROUNIT' USING ERRCODE = '22003';
  END IF;
  IF reservation.exchange_rate_id IS NULL THEN
    converted_cost := native_cost;
  ELSE
    converted_cost := round(
      (native_cost::NUMERIC * fx.rate_nanos) / 1000000000
    )::BIGINT;
  END IF;
  gross := revenue - converted_cost;
  margin := round((gross::NUMERIC / revenue) * 10000)::INTEGER;
  SELECT targets.target_margin_bps INTO target
  FROM public.margin_target_versions AS targets
  WHERE targets.effective_at <= reservation.created_at
  ORDER BY targets.effective_at DESC LIMIT 1;
  target := COALESCE(target, 9500);
  fingerprint := jsonb_build_object(
    'reservation_id', reservation.id,
    'sell_price_id', reservation.sell_price_id,
    'provider_cost_rate_id', reservation.provider_cost_rate_id,
    'exchange_rate_id', reservation.exchange_rate_id,
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
    p_actual_quantity, reservation.sell_price_id, reservation.provider_cost_rate_id,
    reservation.exchange_rate_id, reservation.sell_currency, reservation.provider_id,
    reservation.model_id, reservation.provider_cost_currency, revenue, native_cost,
    converted_cost, gross, margin, target, fingerprint, p_actor
  ) RETURNING * INTO created_valuation;

  UPDATE public.tenant_usage_reservations SET
    status = 'settled',
    actual_quantity = p_actual_quantity,
    actual_credit_microunits = actual_credit_amount,
    reservation_refund_id = refund_entry.ledger_id,
    actual_debit_id = actual_entry.ledger_id,
    valued_usage_id = created_valuation.id,
    settled_at = clock_timestamp()
  WHERE id = reservation.id;

  RETURN QUERY SELECT reservation.id, actual_credit_amount, created_valuation.id,
    revenue, converted_cost, margin, margin < target, true;
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
  SELECT * INTO reservation
  FROM public.tenant_usage_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USAGE_RESERVATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF reservation.actor_user_id <> p_actor THEN
    RAISE EXCEPTION 'USAGE_RESERVATION_ACTOR_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF reservation.status = 'settled' THEN
    RAISE EXCEPTION 'USAGE_RESERVATION_ALREADY_SETTLED' USING ERRCODE = '55000';
  END IF;
  IF reservation.status = 'released' THEN
    SELECT balance_microunits INTO current_balance
    FROM public.tenant_credit_wallets WHERE org_id = reservation.org_id;
    RETURN QUERY SELECT reservation.id, reservation.reserved_credit_microunits,
      current_balance, false;
    RETURN;
  END IF;
  IF char_length(trim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'INVALID_USAGE_RELEASE_REASON' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO refund_entry FROM public.post_tenant_credit_entry(
    p_actor, reservation.org_id, 'refund', reservation.reserved_credit_microunits,
    'meter-refund:' || reservation.operation_key,
    'Libération de la réservation de consommation fournisseur',
    NULL, NULL, NULL, reservation.reservation_debit_id
  );
  UPDATE public.tenant_usage_reservations SET
    status = 'released',
    reservation_refund_id = refund_entry.ledger_id,
    release_reason = trim(p_reason),
    settled_at = clock_timestamp()
  WHERE id = reservation.id;
  RETURN QUERY SELECT reservation.id, reservation.reserved_credit_microunits,
    refund_entry.balance_microunits, true;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_tenant_usages(
  p_actor UUID,
  p_reservation_ids UUID[],
  p_actual_quantities NUMERIC[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE position INTEGER;
BEGIN
  IF cardinality(p_reservation_ids) NOT BETWEEN 1 AND 8
    OR cardinality(p_reservation_ids) <> cardinality(p_actual_quantities)
    OR cardinality(p_reservation_ids) <> (
      SELECT count(DISTINCT reservation_id)
      FROM unnest(p_reservation_ids) AS reservation_id
    )
  THEN
    RAISE EXCEPTION 'INVALID_USAGE_FINALIZATION_BATCH' USING ERRCODE = '22023';
  END IF;
  FOR position IN 1..cardinality(p_reservation_ids) LOOP
    IF p_actual_quantities[position] > 0 THEN
      PERFORM * FROM public.settle_tenant_usage(
        p_actor, p_reservation_ids[position], p_actual_quantities[position]
      );
    ELSE
      PERFORM * FROM public.release_tenant_usage(
        p_actor, p_reservation_ids[position], 'Aucun usage mesuré'
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_tenant_usages(
  p_actor UUID,
  p_reservation_ids UUID[],
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE reservation_id UUID;
BEGIN
  IF cardinality(p_reservation_ids) NOT BETWEEN 1 AND 8
    OR cardinality(p_reservation_ids) <> (
      SELECT count(DISTINCT candidate)
      FROM unnest(p_reservation_ids) AS candidate
    )
  THEN
    RAISE EXCEPTION 'INVALID_USAGE_RELEASE_BATCH' USING ERRCODE = '22023';
  END IF;
  FOREACH reservation_id IN ARRAY p_reservation_ids LOOP
    PERFORM * FROM public.release_tenant_usage(p_actor, reservation_id, p_reason);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_credit_burn_rate(UUID, UUID, TEXT, BIGINT, NUMERIC, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.configure_tenant_billing(UUID, UUID, BOOLEAN, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_tenant_usage(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_tenant_usage(UUID, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_tenant_usage(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_tenant_usages(UUID, UUID[], NUMERIC[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_tenant_usages(UUID, UUID[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_credit_burn_rate(UUID, UUID, TEXT, BIGINT, NUMERIC, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.configure_tenant_billing(UUID, UUID, BOOLEAN, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_tenant_usage(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_tenant_usage(UUID, UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_tenant_usage(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_tenant_usages(UUID, UUID[], NUMERIC[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_tenant_usages(UUID, UUID[], TEXT) TO service_role;
ALTER TABLE public.video_generation_jobs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_video_generation_jobs_org_id
  ON public.video_generation_jobs(org_id);
