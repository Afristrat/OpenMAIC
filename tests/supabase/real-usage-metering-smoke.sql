DO $$
DECLARE
  actor UUID;
  tenant UUID;
  other_tenant UUID;
  reserved RECORD;
  replayed RECORD;
  settled RECORD;
  settled_replay RECORD;
  released RECORD;
  wallet_balance BIGINT;
  reservation_count INTEGER;
BEGIN
  SELECT id INTO actor FROM public.profiles ORDER BY created_at LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'S6_025_SMOKE_REQUIRES_PROFILE'; END IF;

  INSERT INTO public.organizations(
    name, sector, plan, subscription_status, status, seat_limit
  ) VALUES (
    'S6-025 transactional smoke', 'education', 'pro', 'active', 'active', 1
  ) RETURNING id INTO tenant;
  INSERT INTO public.organizations(
    name, sector, plan, subscription_status, status, seat_limit
  ) VALUES (
    'S6-025 isolation smoke', 'education', 'pro', 'active', 'active', 1
  ) RETURNING id INTO other_tenant;

  PERFORM public.create_tenant_sell_price(
    actor, tenant, 'operation', 'ZZZ', 5000000, 1, now() - interval '1 minute',
    'Valeur commerciale du test transactionnel'
  );
  PERFORM public.create_provider_cost_rate(
    actor, 's6025-smoke', 'operation-v1', 'operation', 'ZZZ', 1000000, 1,
    'actual', 'Fixture transactionnelle annulée', now() - interval '1 minute'
  );
  PERFORM public.create_tenant_credit_burn_rate(
    actor, tenant, 'operation', 100000, 1, now() - interval '1 minute',
    'Politique explicite de consommation du test'
  );
  PERFORM public.create_tenant_sell_price(
    actor, tenant, 'image', 'ZZZ', 9000000, 1, now() - interval '1 minute',
    'Valeur commerciale indépendante pour le test d’arrondi'
  );
  PERFORM public.create_provider_cost_rate(
    actor, 's6025-smoke', 'image-v1', 'image', 'ZZZ', 300000, 1,
    'actual', 'Fixture d’arrondi annulée', now() - interval '1 minute'
  );
  PERFORM public.create_tenant_credit_burn_rate(
    actor, tenant, 'image', 100000, 3, now() - interval '1 minute',
    'Politique explicite avec division non entière'
  );
  PERFORM public.configure_tenant_billing(
    actor, tenant, true, 'ZZZ', ARRAY['operation', 'image']
  );
  PERFORM public.post_tenant_credit_entry(
    actor, tenant, 'allocation', 10000000, 's6025-smoke-allocation',
    'Allocation du test transactionnel'
  );

  SELECT * INTO reserved FROM public.reserve_tenant_usage(
    actor, tenant, 's6025-operation-success', 'operation', 10,
    's6025-smoke', 'operation-v1', 'ZZZ', true
  );
  IF NOT reserved.enforcement_enabled OR reserved.reservation_id IS NULL
    OR reserved.reserved_credit_microunits <> 1000000 OR NOT reserved.applied
  THEN RAISE EXCEPTION 'S6_025_RESERVATION_ASSERTION_FAILED'; END IF;

  SELECT * INTO replayed FROM public.reserve_tenant_usage(
    actor, tenant, 's6025-operation-success', 'operation', 10,
    's6025-smoke', 'operation-v1', 'ZZZ', true
  );
  IF replayed.reservation_id <> reserved.reservation_id OR replayed.applied
  THEN RAISE EXCEPTION 'S6_025_RESERVATION_REPLAY_FAILED'; END IF;

  SELECT * INTO settled FROM public.settle_tenant_usage(actor, reserved.reservation_id, 4);
  IF settled.actual_credit_microunits <> 400000
    OR settled.revenue_microunits <> 20000000
    OR settled.cost_microunits <> 4000000
    OR settled.margin_bps <> 8000
    OR NOT settled.applied
  THEN RAISE EXCEPTION 'S6_025_SETTLEMENT_ASSERTION_FAILED'; END IF;

  SELECT * INTO settled_replay
  FROM public.settle_tenant_usage(actor, reserved.reservation_id, 4);
  IF settled_replay.valued_usage_id <> settled.valued_usage_id OR settled_replay.applied
  THEN RAISE EXCEPTION 'S6_025_SETTLEMENT_REPLAY_FAILED'; END IF;

  SELECT * INTO reserved FROM public.reserve_tenant_usage(
    actor, tenant, 's6025-operation-failure', 'operation', 3,
    's6025-smoke', 'operation-v1', 'ZZZ', true
  );
  SELECT * INTO released
  FROM public.release_tenant_usage(actor, reserved.reservation_id, 'Échec fournisseur simulé');
  IF released.refunded_credit_microunits <> 300000 OR NOT released.applied
  THEN RAISE EXCEPTION 'S6_025_RELEASE_ASSERTION_FAILED'; END IF;

  SELECT * INTO reserved FROM public.reserve_tenant_usage(
    actor, tenant, 's6025-rounding-boundary', 'image', 1,
    's6025-smoke', 'image-v1', 'ZZZ', true
  );
  IF reserved.reserved_credit_microunits <> 33334
  THEN RAISE EXCEPTION 'S6_025_ROUNDING_ASSERTION_FAILED'; END IF;
  PERFORM * FROM public.release_tenant_usage(
    actor, reserved.reservation_id, 'Libération du test d’arrondi'
  );

  SELECT balance_microunits INTO wallet_balance
  FROM public.tenant_credit_wallets WHERE org_id = tenant;
  IF wallet_balance <> 9600000
  THEN RAISE EXCEPTION 'S6_025_WALLET_ASSERTION_FAILED:%', wallet_balance; END IF;

  SELECT count(*) INTO reservation_count
  FROM public.tenant_usage_reservations WHERE org_id = other_tenant;
  SELECT * INTO reserved FROM public.reserve_tenant_usage(
    actor, other_tenant, 's6025-isolation-noop', 'operation', 1,
    's6025-smoke', 'operation-v1', 'ZZZ', false
  );
  IF reserved.enforcement_enabled OR reserved.reservation_id IS NOT NULL
    OR reservation_count <> 0
  THEN RAISE EXCEPTION 'S6_025_TENANT_ISOLATION_FAILED'; END IF;

  BEGIN
    PERFORM * FROM public.reserve_tenant_usage(
      actor, tenant, 's6025-unstable-key', 'operation', 1,
      's6025-smoke', 'operation-v1', 'ZZZ', false
    );
    RAISE EXCEPTION 'S6_025_UNSTABLE_IDEMPOTENCY_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
END;
$$;
