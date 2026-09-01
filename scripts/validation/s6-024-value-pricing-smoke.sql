\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  actor_id UUID;
  tenant_id UUID;
  allocation RECORD;
  valued_same_currency RECORD;
  valued_with_fx RECORD;
  tenant_summary RECORD;
  platform_summary RECORD;
  original_revenue BIGINT;
  original_price_id UUID;
  effective_at TIMESTAMPTZ := clock_timestamp() - interval '5 minutes';
BEGIN
  SELECT id INTO actor_id FROM public.profiles ORDER BY created_at LIMIT 1;
  IF actor_id IS NULL THEN RAISE EXCEPTION 'SMOKE_ACTOR_NOT_FOUND'; END IF;

  INSERT INTO public.organizations(name, sector, status, seat_limit)
  VALUES ('S6-024 temporary value pricing tenant', 'education', 'active', 1)
  RETURNING id INTO tenant_id;

  SELECT * INTO allocation FROM public.post_tenant_credit_entry(
    actor_id, tenant_id, 'allocation', 10000000, 's6-024-allocation',
    'Crédits temporaires de recette S6-024', NULL, NULL, NULL, NULL
  );
  IF allocation.balance_microunits <> 10000000 THEN
    RAISE EXCEPTION 'SMOKE_ALLOCATION_FAILED';
  END IF;

  PERFORM public.create_tenant_sell_price(
    actor_id, tenant_id, 'operation', 'mad', 100000000, 1,
    effective_at, 'Prix explicite fondé sur la valeur du service livré'
  );
  PERFORM public.create_provider_cost_rate(
    actor_id, 's6-024-provider', 'same-currency', 'operation', 'mad',
    10000000, 1, 'actual', 'Facture fournisseur temporaire S6-024', effective_at
  );
  BEGIN
    PERFORM public.create_tenant_sell_price(
      actor_id, tenant_id, 'operation', 'MAD', 110000000, 1,
      effective_at, 'Chevauchement qui doit être rejeté'
    );
    RAISE EXCEPTION 'SMOKE_SELL_PRICE_OVERLAP_ACCEPTED';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.create_provider_cost_rate(
      actor_id, 's6-024-provider', 'same-currency', 'operation', 'MAD',
      11000000, 1, 'estimate', 'Chevauchement qui doit être rejeté', effective_at
    );
    RAISE EXCEPTION 'SMOKE_PROVIDER_COST_OVERLAP_ACCEPTED';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;

  SELECT * INTO valued_same_currency FROM public.debit_and_value_tenant_usage(
    actor_id, tenant_id, 1000000, 's6-024-debit-operation', 'Usage temporaire',
    'operation', 1, 's6-024-operation', 'MAD', 's6-024-provider',
    'same-currency', 'MAD'
  );
  IF valued_same_currency.revenue_microunits <> 100000000
    OR valued_same_currency.cost_microunits <> 10000000
    OR valued_same_currency.gross_margin_microunits <> 90000000
    OR valued_same_currency.margin_bps <> 9000
    OR valued_same_currency.target_margin_bps <> 9500
    OR NOT valued_same_currency.below_target
  THEN RAISE EXCEPTION 'SMOKE_VALUE_MARGIN_FAILED'; END IF;

  SELECT sell_price_id, revenue_microunits INTO original_price_id, original_revenue
  FROM public.valued_billable_usage WHERE id = valued_same_currency.valued_usage_id;
  PERFORM public.create_tenant_sell_price(
    actor_id, tenant_id, 'operation', 'MAD', 200000000, 1,
    clock_timestamp() + interval '1 second', 'Nouvelle décision commerciale explicite'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.valued_billable_usage
    WHERE id = valued_same_currency.valued_usage_id
      AND sell_price_id = original_price_id AND revenue_microunits = original_revenue
  ) THEN RAISE EXCEPTION 'SMOKE_HISTORY_REWRITTEN'; END IF;

  PERFORM public.create_tenant_sell_price(
    actor_id, tenant_id, 'image', 'MAD', 100000000, 1,
    effective_at, 'Valeur commerciale explicite de l’image'
  );
  PERFORM public.create_provider_cost_rate(
    actor_id, 's6-024-provider', 'cross-currency', 'image', 'USD',
    1000000, 1, 'estimate', 'Estimation fournisseur temporaire S6-024', effective_at
  );
  PERFORM public.create_currency_exchange_rate(
    actor_id, 'usd', 'mad', 10000000000,
    'Taux audité temporaire S6-024', effective_at
  );
  BEGIN
    PERFORM public.create_currency_exchange_rate(
      actor_id, 'USD', 'MAD', 11000000000,
      'Chevauchement qui doit être rejeté', effective_at
    );
    RAISE EXCEPTION 'SMOKE_EXCHANGE_RATE_OVERLAP_ACCEPTED';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
  SELECT * INTO valued_with_fx FROM public.debit_and_value_tenant_usage(
    actor_id, tenant_id, 1000000, 's6-024-debit-image', 'Usage temporaire FX',
    'image', 1, 's6-024-image', 'MAD', 's6-024-provider', 'cross-currency', 'USD'
  );
  IF valued_with_fx.cost_microunits <> 10000000
    OR valued_with_fx.margin_bps <> 9000
    OR NOT EXISTS (
      SELECT 1 FROM public.valued_billable_usage
      WHERE id = valued_with_fx.valued_usage_id AND exchange_rate_id IS NOT NULL
    )
  THEN RAISE EXCEPTION 'SMOKE_FX_FAILED'; END IF;

  SELECT * INTO tenant_summary FROM public.tenant_margin_summary(
    tenant_id, effective_at, clock_timestamp() + interval '1 minute'
  );
  IF tenant_summary.revenue_microunits <> 200000000
    OR tenant_summary.cost_microunits <> 20000000
    OR tenant_summary.margin_bps <> 9000
    OR NOT tenant_summary.below_target
  THEN RAISE EXCEPTION 'SMOKE_TENANT_SUMMARY_FAILED'; END IF;

  SELECT * INTO platform_summary FROM public.platform_margin_summary(
    effective_at, clock_timestamp() + interval '1 minute'
  );
  IF platform_summary.revenue_microunits < tenant_summary.revenue_microunits
  THEN RAISE EXCEPTION 'SMOKE_PLATFORM_SUMMARY_FAILED'; END IF;

  BEGIN
    UPDATE public.valued_billable_usage SET revenue_microunits = 1
    WHERE id = valued_same_currency.valued_usage_id;
    RAISE EXCEPTION 'SMOKE_IMMUTABILITY_NOT_ENFORCED';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.tenant_sell_prices', 'SELECT')
    OR has_function_privilege(
      'authenticated',
      'public.create_tenant_sell_price(uuid,uuid,text,text,bigint,numeric,timestamptz,text)',
      'EXECUTE'
    )
  THEN RAISE EXCEPTION 'SMOKE_BROWSER_PRIVILEGES_TOO_BROAD'; END IF;
END;
$$;

GRANT SELECT ON public.tenant_sell_prices TO authenticated;
GRANT SELECT ON public.provider_cost_rates TO authenticated;
GRANT SELECT ON public.currency_exchange_rates TO authenticated;
GRANT SELECT ON public.valued_billable_usage TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenant_sell_prices)
    OR EXISTS (SELECT 1 FROM public.provider_cost_rates)
    OR EXISTS (SELECT 1 FROM public.currency_exchange_rates)
    OR EXISTS (SELECT 1 FROM public.valued_billable_usage)
  THEN RAISE EXCEPTION 'SMOKE_RLS_ISOLATION_FAILED'; END IF;
END;
$$;
RESET ROLE;

ROLLBACK;

SELECT
  to_regclass('public.valued_billable_usage') IS NOT NULL AS schema_present,
  (SELECT target_margin_bps FROM public.margin_target_versions
    ORDER BY effective_at DESC LIMIT 1) = 9500 AS default_target_is_95_percent,
  NOT has_table_privilege(
    'authenticated', 'public.tenant_sell_prices', 'SELECT'
  ) AS browser_table_access_revoked,
  NOT has_function_privilege(
    'authenticated',
    'public.create_tenant_sell_price(uuid,uuid,text,text,bigint,numeric,timestamptz,text)',
    'EXECUTE'
  ) AS browser_rpc_access_revoked,
  (SELECT count(*) FROM public.organizations
    WHERE name = 'S6-024 temporary value pricing tenant') = 0 AS no_temporary_tenant,
  (SELECT count(*) FROM public.provider_cost_rates
    WHERE provider_id = 's6-024-provider') = 0 AS no_temporary_cost,
  (SELECT count(*) FROM public.currency_exchange_rates
    WHERE provenance LIKE '%S6-024%') = 0 AS no_temporary_fx;
