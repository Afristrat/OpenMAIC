-- S6-024 — Value-based sell prices, independent provider costs and immutable margins.

CREATE TABLE public.tenant_sell_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  billable_unit TEXT NOT NULL CHECK (billable_unit IN (
    'llm_input_token', 'llm_output_token', 'tts_second', 'asr_second',
    'image', 'video_second', 'storage_byte', 'operation'
  )),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  price_microunits BIGINT NOT NULL CHECK (price_microunits > 0),
  quantity_basis NUMERIC(24, 6) NOT NULL CHECK (quantity_basis > 0),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ CHECK (valid_to IS NULL OR valid_to > valid_from),
  commercial_rationale TEXT NOT NULL CHECK (char_length(trim(commercial_rationale)) BETWEEN 1 AND 1000),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.provider_cost_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id TEXT NOT NULL CHECK (char_length(provider_id) BETWEEN 1 AND 120),
  model_id TEXT NOT NULL CHECK (char_length(model_id) BETWEEN 1 AND 200),
  billable_unit TEXT NOT NULL CHECK (billable_unit IN (
    'llm_input_token', 'llm_output_token', 'tts_second', 'asr_second',
    'image', 'video_second', 'storage_byte', 'operation'
  )),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  cost_microunits BIGINT NOT NULL CHECK (cost_microunits >= 0),
  quantity_basis NUMERIC(24, 6) NOT NULL CHECK (quantity_basis > 0),
  cost_source TEXT NOT NULL CHECK (cost_source IN ('actual', 'estimate')),
  provenance TEXT NOT NULL CHECK (char_length(trim(provenance)) BETWEEN 1 AND 1000),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ CHECK (valid_to IS NULL OR valid_to > valid_from),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.currency_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
  quote_currency TEXT NOT NULL CHECK (quote_currency ~ '^[A-Z]{3}$'),
  rate_nanos BIGINT NOT NULL CHECK (rate_nanos > 0),
  provenance TEXT NOT NULL CHECK (char_length(trim(provenance)) BETWEEN 1 AND 1000),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ CHECK (valid_to IS NULL OR valid_to > valid_from),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (base_currency <> quote_currency)
);

CREATE TABLE public.margin_target_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_margin_bps INTEGER NOT NULL CHECK (target_margin_bps BETWEEN 0 AND 10000),
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rationale TEXT NOT NULL CHECK (char_length(trim(rationale)) BETWEEN 1 AND 500),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (effective_at)
);

INSERT INTO public.margin_target_versions(target_margin_bps, rationale)
VALUES (9500, 'Cible Qalem initiale');

CREATE TABLE public.valued_billable_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  credit_ledger_id UUID NOT NULL UNIQUE REFERENCES public.tenant_credit_ledger(id) ON DELETE CASCADE,
  billable_unit TEXT NOT NULL,
  quantity NUMERIC(24, 6) NOT NULL CHECK (quantity > 0),
  sell_price_id UUID NOT NULL REFERENCES public.tenant_sell_prices(id),
  provider_cost_rate_id UUID NOT NULL REFERENCES public.provider_cost_rates(id),
  exchange_rate_id UUID REFERENCES public.currency_exchange_rates(id),
  sell_currency TEXT NOT NULL CHECK (sell_currency ~ '^[A-Z]{3}$'),
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  provider_cost_currency TEXT NOT NULL CHECK (provider_cost_currency ~ '^[A-Z]{3}$'),
  revenue_microunits BIGINT NOT NULL CHECK (revenue_microunits > 0),
  provider_cost_native_microunits BIGINT NOT NULL CHECK (provider_cost_native_microunits >= 0),
  cost_microunits BIGINT NOT NULL CHECK (cost_microunits >= 0),
  gross_margin_microunits BIGINT NOT NULL,
  margin_bps INTEGER NOT NULL,
  target_margin_bps INTEGER NOT NULL CHECK (target_margin_bps BETWEEN 0 AND 10000),
  valuation_fingerprint TEXT NOT NULL,
  valued_by UUID NOT NULL,
  valued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tenant_sell_prices_lookup_idx
  ON public.tenant_sell_prices(org_id, billable_unit, currency, valid_from DESC);
CREATE INDEX provider_cost_rates_lookup_idx
  ON public.provider_cost_rates(provider_id, model_id, billable_unit, currency, valid_from DESC);
CREATE INDEX currency_exchange_rates_lookup_idx
  ON public.currency_exchange_rates(base_currency, quote_currency, valid_from DESC);
CREATE INDEX valued_billable_usage_margin_idx
  ON public.valued_billable_usage(org_id, valued_at DESC, billable_unit);

ALTER TABLE public.tenant_sell_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_cost_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.margin_target_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valued_billable_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_sell_prices FROM anon, authenticated;
REVOKE ALL ON TABLE public.provider_cost_rates FROM anon, authenticated;
REVOKE ALL ON TABLE public.currency_exchange_rates FROM anon, authenticated;
REVOKE ALL ON TABLE public.margin_target_versions FROM anon, authenticated;
REVOKE ALL ON TABLE public.valued_billable_usage FROM anon, authenticated;
GRANT ALL ON TABLE public.tenant_sell_prices TO service_role;
GRANT ALL ON TABLE public.provider_cost_rates TO service_role;
GRANT ALL ON TABLE public.currency_exchange_rates TO service_role;
GRANT ALL ON TABLE public.margin_target_versions TO service_role;
GRANT ALL ON TABLE public.valued_billable_usage TO service_role;

CREATE OR REPLACE FUNCTION public.protect_economic_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME IN ('tenant_sell_prices', 'valued_billable_usage') AND pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'ECONOMIC_VERSION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.valid_to IS NULL
    AND NEW.valid_to IS NOT NULL
    AND NEW.valid_to > OLD.valid_from
    AND (to_jsonb(NEW) - 'valid_to') = (to_jsonb(OLD) - 'valid_to')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ECONOMIC_VERSION_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER protect_tenant_sell_price_version
  BEFORE UPDATE OR DELETE ON public.tenant_sell_prices
  FOR EACH ROW EXECUTE FUNCTION public.protect_economic_version();
CREATE TRIGGER protect_provider_cost_version
  BEFORE UPDATE OR DELETE ON public.provider_cost_rates
  FOR EACH ROW EXECUTE FUNCTION public.protect_economic_version();
CREATE TRIGGER protect_exchange_rate_version
  BEFORE UPDATE OR DELETE ON public.currency_exchange_rates
  FOR EACH ROW EXECUTE FUNCTION public.protect_economic_version();

CREATE OR REPLACE FUNCTION public.prevent_economic_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'valued_billable_usage' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'ECONOMIC_SNAPSHOT_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER protect_margin_target_version
  BEFORE UPDATE OR DELETE ON public.margin_target_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_economic_snapshot_mutation();
CREATE TRIGGER protect_valued_billable_usage
  BEFORE UPDATE OR DELETE ON public.valued_billable_usage
  FOR EACH ROW EXECUTE FUNCTION public.prevent_economic_snapshot_mutation();

CREATE OR REPLACE FUNCTION public.create_tenant_sell_price(
  p_actor UUID,
  p_org_id UUID,
  p_billable_unit TEXT,
  p_currency TEXT,
  p_price_microunits BIGINT,
  p_quantity_basis NUMERIC,
  p_valid_from TIMESTAMPTZ,
  p_commercial_rationale TEXT
)
RETURNS public.tenant_sell_prices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE created public.tenant_sell_prices;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
    OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id)
  THEN RAISE EXCEPTION 'INVALID_ECONOMIC_ACTOR_OR_TENANT' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::TEXT || '|' || p_billable_unit || '|' || upper(p_currency), 0));
  UPDATE public.tenant_sell_prices SET valid_to = p_valid_from
  WHERE org_id = p_org_id AND billable_unit = p_billable_unit AND currency = upper(p_currency)
    AND valid_to IS NULL AND valid_from < p_valid_from;
  IF EXISTS (
    SELECT 1 FROM public.tenant_sell_prices
    WHERE org_id = p_org_id AND billable_unit = p_billable_unit AND currency = upper(p_currency)
      AND (valid_to IS NULL OR valid_to > p_valid_from)
  ) THEN RAISE EXCEPTION 'SELL_PRICE_PERIOD_OVERLAP' USING ERRCODE = '23P01'; END IF;
  INSERT INTO public.tenant_sell_prices(
    org_id, billable_unit, currency, price_microunits, quantity_basis,
    valid_from, commercial_rationale, created_by
  ) VALUES (
    p_org_id, p_billable_unit, upper(p_currency), p_price_microunits, p_quantity_basis,
    p_valid_from, trim(p_commercial_rationale), p_actor
  ) RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_provider_cost_rate(
  p_actor UUID,
  p_provider_id TEXT,
  p_model_id TEXT,
  p_billable_unit TEXT,
  p_currency TEXT,
  p_cost_microunits BIGINT,
  p_quantity_basis NUMERIC,
  p_cost_source TEXT,
  p_provenance TEXT,
  p_valid_from TIMESTAMPTZ
)
RETURNS public.provider_cost_rates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE created public.provider_cost_rates;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
  THEN RAISE EXCEPTION 'INVALID_ECONOMIC_ACTOR' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(trim(p_provider_id) || '|' || trim(p_model_id) || '|' || p_billable_unit || '|' || upper(p_currency), 0));
  UPDATE public.provider_cost_rates SET valid_to = p_valid_from
  WHERE provider_id = trim(p_provider_id) AND model_id = trim(p_model_id)
    AND billable_unit = p_billable_unit AND currency = upper(p_currency)
    AND valid_to IS NULL AND valid_from < p_valid_from;
  IF EXISTS (
    SELECT 1 FROM public.provider_cost_rates
    WHERE provider_id = trim(p_provider_id) AND model_id = trim(p_model_id)
      AND billable_unit = p_billable_unit AND currency = upper(p_currency)
      AND (valid_to IS NULL OR valid_to > p_valid_from)
  ) THEN RAISE EXCEPTION 'PROVIDER_COST_PERIOD_OVERLAP' USING ERRCODE = '23P01'; END IF;
  INSERT INTO public.provider_cost_rates(
    provider_id, model_id, billable_unit, currency, cost_microunits,
    quantity_basis, cost_source, provenance, valid_from, created_by
  ) VALUES (
    trim(p_provider_id), trim(p_model_id), p_billable_unit, upper(p_currency), p_cost_microunits,
    p_quantity_basis, p_cost_source, trim(p_provenance), p_valid_from, p_actor
  ) RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_currency_exchange_rate(
  p_actor UUID,
  p_base_currency TEXT,
  p_quote_currency TEXT,
  p_rate_nanos BIGINT,
  p_provenance TEXT,
  p_valid_from TIMESTAMPTZ
)
RETURNS public.currency_exchange_rates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE created public.currency_exchange_rates;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
  THEN RAISE EXCEPTION 'INVALID_ECONOMIC_ACTOR' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(upper(p_base_currency) || '|' || upper(p_quote_currency), 0));
  UPDATE public.currency_exchange_rates SET valid_to = p_valid_from
  WHERE base_currency = upper(p_base_currency) AND quote_currency = upper(p_quote_currency)
    AND valid_to IS NULL AND valid_from < p_valid_from;
  IF EXISTS (
    SELECT 1 FROM public.currency_exchange_rates
    WHERE base_currency = upper(p_base_currency) AND quote_currency = upper(p_quote_currency)
      AND (valid_to IS NULL OR valid_to > p_valid_from)
  ) THEN RAISE EXCEPTION 'EXCHANGE_RATE_PERIOD_OVERLAP' USING ERRCODE = '23P01'; END IF;
  INSERT INTO public.currency_exchange_rates(
    base_currency, quote_currency, rate_nanos, provenance, valid_from, created_by
  ) VALUES (
    upper(p_base_currency), upper(p_quote_currency), p_rate_nanos,
    trim(p_provenance), p_valid_from, p_actor
  ) RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_margin_target(
  p_actor UUID,
  p_target_margin_bps INTEGER,
  p_rationale TEXT
)
RETURNS public.margin_target_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE created public.margin_target_versions;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
  THEN RAISE EXCEPTION 'INVALID_ECONOMIC_ACTOR' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('qalem-margin-target', 0));
  INSERT INTO public.margin_target_versions(
    target_margin_bps, effective_at, rationale, created_by
  )
  VALUES (p_target_margin_bps, clock_timestamp(), trim(p_rationale), p_actor)
  RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.value_tenant_credit_usage(
  p_actor UUID,
  p_credit_ledger_id UUID,
  p_sell_currency TEXT,
  p_provider_id TEXT,
  p_model_id TEXT,
  p_provider_cost_currency TEXT
)
RETURNS TABLE(
  valued_usage_id UUID,
  revenue_microunits BIGINT,
  cost_microunits BIGINT,
  gross_margin_microunits BIGINT,
  margin_bps INTEGER,
  target_margin_bps INTEGER,
  below_target BOOLEAN,
  applied BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  debit public.tenant_credit_ledger;
  price public.tenant_sell_prices;
  cost_rate public.provider_cost_rates;
  fx public.currency_exchange_rates;
  existing public.valued_billable_usage;
  created public.valued_billable_usage;
  native_cost BIGINT;
  converted_cost BIGINT;
  revenue BIGINT;
  gross BIGINT;
  margin INTEGER;
  target INTEGER;
  fingerprint TEXT;
  applied_exchange_rate_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
  THEN RAISE EXCEPTION 'INVALID_ECONOMIC_ACTOR' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_credit_ledger_id::TEXT, 0));
  SELECT * INTO debit FROM public.tenant_credit_ledger
  WHERE id = p_credit_ledger_id AND entry_type = 'debit';
  IF NOT FOUND THEN RAISE EXCEPTION 'BILLABLE_DEBIT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  fingerprint := jsonb_build_object(
    'sell_currency', upper(p_sell_currency), 'provider', p_provider_id,
    'model', p_model_id, 'cost_currency', upper(p_provider_cost_currency)
  )::TEXT;
  SELECT * INTO existing FROM public.valued_billable_usage
  WHERE credit_ledger_id = p_credit_ledger_id;
  IF FOUND THEN
    IF existing.valuation_fingerprint <> fingerprint
    THEN RAISE EXCEPTION 'VALUATION_IDEMPOTENCY_MISMATCH' USING ERRCODE = '22023'; END IF;
    RETURN QUERY SELECT existing.id, existing.revenue_microunits, existing.cost_microunits,
      existing.gross_margin_microunits, existing.margin_bps, existing.target_margin_bps,
      existing.margin_bps < existing.target_margin_bps, false;
    RETURN;
  END IF;
  SELECT * INTO price FROM public.tenant_sell_prices
  WHERE org_id = debit.org_id AND billable_unit = debit.billable_unit
    AND currency = upper(p_sell_currency) AND valid_from <= debit.created_at
    AND (valid_to IS NULL OR valid_to > debit.created_at)
  ORDER BY valid_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SELL_PRICE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO cost_rate FROM public.provider_cost_rates
  WHERE provider_id = p_provider_id AND model_id = p_model_id
    AND billable_unit = debit.billable_unit AND currency = upper(p_provider_cost_currency)
    AND valid_from <= debit.created_at AND (valid_to IS NULL OR valid_to > debit.created_at)
  ORDER BY valid_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROVIDER_COST_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  revenue := round((debit.quantity / price.quantity_basis) * price.price_microunits)::BIGINT;
  native_cost := round((debit.quantity / cost_rate.quantity_basis) * cost_rate.cost_microunits)::BIGINT;
  IF revenue <= 0 THEN RAISE EXCEPTION 'VALUATION_BELOW_MICROUNIT' USING ERRCODE = '22003'; END IF;
  IF cost_rate.currency = price.currency THEN
    converted_cost := native_cost;
  ELSE
    SELECT * INTO fx FROM public.currency_exchange_rates
    WHERE base_currency = cost_rate.currency AND quote_currency = price.currency
      AND valid_from <= debit.created_at AND (valid_to IS NULL OR valid_to > debit.created_at)
    ORDER BY valid_from DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'EXCHANGE_RATE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    applied_exchange_rate_id := fx.id;
    converted_cost := round((native_cost::NUMERIC * fx.rate_nanos) / 1000000000)::BIGINT;
  END IF;
  gross := revenue - converted_cost;
  margin := round((gross::NUMERIC / revenue) * 10000)::INTEGER;
  SELECT targets.target_margin_bps INTO target
  FROM public.margin_target_versions AS targets
  WHERE targets.effective_at <= debit.created_at
  ORDER BY targets.effective_at DESC LIMIT 1;
  target := COALESCE(target, 9500);

  INSERT INTO public.valued_billable_usage(
    org_id, credit_ledger_id, billable_unit, quantity, sell_price_id,
    provider_cost_rate_id, exchange_rate_id, sell_currency, provider_id, model_id,
    provider_cost_currency, revenue_microunits, provider_cost_native_microunits,
    cost_microunits, gross_margin_microunits, margin_bps, target_margin_bps,
    valuation_fingerprint, valued_by
  ) VALUES (
    debit.org_id, debit.id, debit.billable_unit, debit.quantity, price.id,
    cost_rate.id, applied_exchange_rate_id, price.currency, trim(p_provider_id), trim(p_model_id),
    cost_rate.currency, revenue, native_cost, converted_cost, gross, margin, target,
    fingerprint, p_actor
  ) RETURNING * INTO created;
  RETURN QUERY SELECT created.id, revenue, converted_cost, gross, margin, target,
    margin < target, true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_margin_summary(
  p_org_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE(
  revenue_microunits BIGINT,
  cost_microunits BIGINT,
  gross_margin_microunits BIGINT,
  margin_bps INTEGER,
  target_margin_bps INTEGER,
  below_target BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH totals AS (
    SELECT COALESCE(sum(revenue_microunits), 0)::BIGINT AS revenue,
      COALESCE(sum(cost_microunits), 0)::BIGINT AS cost
    FROM public.valued_billable_usage
    WHERE org_id = p_org_id AND valued_at >= p_from AND valued_at < p_to
  ), economic_state AS (
    SELECT totals.revenue, totals.cost,
      CASE WHEN totals.revenue = 0 THEN 0
        ELSE round(((totals.revenue - totals.cost)::NUMERIC / totals.revenue) * 10000)::INTEGER END AS margin,
      COALESCE((SELECT target_margin_bps FROM public.margin_target_versions
        WHERE effective_at <= now() ORDER BY effective_at DESC LIMIT 1), 9500) AS target
    FROM totals
  )
  SELECT revenue, cost, revenue - cost, margin, target,
    revenue > 0 AND margin < target
  FROM economic_state;
$$;

CREATE OR REPLACE FUNCTION public.debit_and_value_tenant_usage(
  p_actor UUID,
  p_org_id UUID,
  p_credit_microunits BIGINT,
  p_idempotency_key TEXT,
  p_reason TEXT,
  p_billable_unit TEXT,
  p_quantity NUMERIC,
  p_reference_id TEXT,
  p_sell_currency TEXT,
  p_provider_id TEXT,
  p_model_id TEXT,
  p_provider_cost_currency TEXT
)
RETURNS TABLE(
  ledger_id UUID,
  balance_microunits BIGINT,
  credit_applied BOOLEAN,
  valued_usage_id UUID,
  revenue_microunits BIGINT,
  cost_microunits BIGINT,
  gross_margin_microunits BIGINT,
  margin_bps INTEGER,
  target_margin_bps INTEGER,
  below_target BOOLEAN,
  valuation_applied BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE posted RECORD;
DECLARE valued RECORD;
BEGIN
  IF p_credit_microunits <= 0 THEN
    RAISE EXCEPTION 'INVALID_CREDIT_DEBIT' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO posted FROM public.post_tenant_credit_entry(
    p_actor, p_org_id, 'debit', -p_credit_microunits, p_idempotency_key,
    p_reason, p_billable_unit, p_quantity, p_reference_id, NULL
  );
  SELECT * INTO valued FROM public.value_tenant_credit_usage(
    p_actor, posted.ledger_id, p_sell_currency, p_provider_id,
    p_model_id, p_provider_cost_currency
  );
  RETURN QUERY SELECT posted.ledger_id, posted.balance_microunits, posted.applied,
    valued.valued_usage_id, valued.revenue_microunits, valued.cost_microunits,
    valued.gross_margin_microunits, valued.margin_bps, valued.target_margin_bps,
    valued.below_target, valued.applied;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_margin_breakdown(
  p_org_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE(
  billable_unit TEXT,
  revenue_microunits BIGINT,
  cost_microunits BIGINT,
  gross_margin_microunits BIGINT,
  margin_bps INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT usage.billable_unit,
    sum(usage.revenue_microunits)::BIGINT,
    sum(usage.cost_microunits)::BIGINT,
    (sum(usage.revenue_microunits) - sum(usage.cost_microunits))::BIGINT,
    round(((sum(usage.revenue_microunits) - sum(usage.cost_microunits))::NUMERIC
      / sum(usage.revenue_microunits)) * 10000)::INTEGER
  FROM public.valued_billable_usage AS usage
  WHERE usage.org_id = p_org_id
    AND usage.valued_at >= p_from AND usage.valued_at < p_to
  GROUP BY usage.billable_unit
  ORDER BY usage.billable_unit;
$$;

CREATE OR REPLACE FUNCTION public.platform_margin_summary(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE(
  revenue_microunits BIGINT,
  cost_microunits BIGINT,
  gross_margin_microunits BIGINT,
  weighted_margin_bps INTEGER,
  target_margin_bps INTEGER,
  below_target BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH totals AS (
    SELECT COALESCE(sum(revenue_microunits), 0)::BIGINT AS revenue,
      COALESCE(sum(cost_microunits), 0)::BIGINT AS cost
    FROM public.valued_billable_usage
    WHERE valued_at >= p_from AND valued_at < p_to
  ), economic_state AS (
    SELECT totals.revenue, totals.cost,
      CASE WHEN totals.revenue = 0 THEN 0
        ELSE round(((totals.revenue - totals.cost)::NUMERIC / totals.revenue) * 10000)::INTEGER END AS margin,
      COALESCE((SELECT target_margin_bps FROM public.margin_target_versions
        WHERE effective_at <= now() ORDER BY effective_at DESC LIMIT 1), 9500) AS target
    FROM totals
  )
  SELECT revenue, cost, revenue - cost, margin, target,
    revenue > 0 AND margin < target
  FROM economic_state;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_sell_price(UUID, UUID, TEXT, TEXT, BIGINT, NUMERIC, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_provider_cost_rate(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_currency_exchange_rate(UUID, TEXT, TEXT, BIGINT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_margin_target(UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.value_tenant_credit_usage(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tenant_margin_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_margin_summary(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.debit_and_value_tenant_usage(UUID, UUID, BIGINT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tenant_margin_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_sell_price(UUID, UUID, TEXT, TEXT, BIGINT, NUMERIC, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_provider_cost_rate(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_currency_exchange_rate(UUID, TEXT, TEXT, BIGINT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_margin_target(UUID, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.value_tenant_credit_usage(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.tenant_margin_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_margin_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_and_value_tenant_usage(UUID, UUID, BIGINT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.tenant_margin_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
