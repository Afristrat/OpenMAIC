-- S6-023 — Atomic tenant credit wallet and immutable billable-usage ledger.

CREATE TABLE public.tenant_credit_wallets (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance_microunits BIGINT NOT NULL DEFAULT 0 CHECK (balance_microunits >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tenant_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('allocation', 'debit', 'refund', 'correction')),
  delta_microunits BIGINT NOT NULL CHECK (delta_microunits <> 0),
  billable_unit TEXT CHECK (
    billable_unit IS NULL OR billable_unit IN (
      'llm_input_token',
      'llm_output_token',
      'tts_second',
      'asr_second',
      'image',
      'video_second',
      'storage_byte',
      'operation'
    )
  ),
  quantity NUMERIC(24, 6),
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 1 AND 500),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL,
  reference_id TEXT CHECK (reference_id IS NULL OR char_length(reference_id) BETWEEN 1 AND 200),
  reversal_of UUID REFERENCES public.tenant_credit_ledger(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_credit_ledger_entry_shape CHECK (
    (entry_type = 'debit' AND delta_microunits < 0 AND billable_unit IS NOT NULL AND quantity > 0 AND reference_id IS NOT NULL AND reversal_of IS NULL)
    OR (entry_type = 'refund' AND delta_microunits > 0 AND billable_unit IS NULL AND quantity IS NULL AND reference_id IS NULL AND reversal_of IS NOT NULL)
    OR (entry_type = 'allocation' AND delta_microunits > 0 AND billable_unit IS NULL AND quantity IS NULL AND reference_id IS NULL AND reversal_of IS NULL)
    OR (entry_type = 'correction' AND billable_unit IS NULL AND quantity IS NULL AND reference_id IS NULL AND reversal_of IS NULL)
  ),
  UNIQUE (org_id, idempotency_key)
);

CREATE UNIQUE INDEX tenant_credit_ledger_single_refund_idx
  ON public.tenant_credit_ledger(reversal_of)
  WHERE reversal_of IS NOT NULL;
CREATE INDEX tenant_credit_ledger_org_created_idx
  ON public.tenant_credit_ledger(org_id, created_at DESC);

ALTER TABLE public.tenant_credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins read credit wallet" ON public.tenant_credit_wallets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = tenant_credit_wallets.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Tenant admins read credit ledger" ON public.tenant_credit_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = tenant_credit_ledger.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('admin', 'manager')
    )
  );

CREATE OR REPLACE FUNCTION public.prevent_credit_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- A tenant deletion may cascade its complete wallet. Direct ledger rewrites
  -- remain forbidden to every role, including service_role.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'CREDIT_LEDGER_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER prevent_credit_ledger_mutation
  BEFORE UPDATE OR DELETE ON public.tenant_credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.prevent_credit_ledger_mutation();

CREATE OR REPLACE FUNCTION public.enforce_credit_wallet_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  ledger_balance BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'CREDIT_WALLET_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  SELECT COALESCE(sum(delta_microunits), 0)::BIGINT INTO ledger_balance
  FROM public.tenant_credit_ledger
  WHERE tenant_credit_ledger.org_id = NEW.org_id;
  IF NEW.balance_microunits <> ledger_balance THEN
    RAISE EXCEPTION 'CREDIT_LEDGER_DIVERGENCE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_credit_wallet_balance
  BEFORE INSERT OR UPDATE OF balance_microunits OR DELETE ON public.tenant_credit_wallets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_credit_wallet_balance();

CREATE OR REPLACE FUNCTION public.post_tenant_credit_entry(
  actor_user_id UUID,
  tenant_id UUID,
  credit_entry_type TEXT,
  credit_delta_microunits BIGINT,
  credit_idempotency_key TEXT,
  credit_reason TEXT,
  usage_unit TEXT DEFAULT NULL,
  usage_quantity NUMERIC DEFAULT NULL,
  usage_reference_id TEXT DEFAULT NULL,
  reversed_ledger_id UUID DEFAULT NULL
)
RETURNS TABLE (
  ledger_id UUID,
  balance_microunits BIGINT,
  applied BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tenant_status TEXT;
  wallet_balance BIGINT;
  ledger_balance BIGINT;
  existing_entry public.tenant_credit_ledger;
  target_debit public.tenant_credit_ledger;
  created_entry public.tenant_credit_ledger;
  fingerprint TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = actor_user_id) THEN
    RAISE EXCEPTION 'INVALID_CREDIT_ACTOR' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO tenant_status FROM public.organizations WHERE id = tenant_id;
  IF tenant_status IS NULL THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF credit_entry_type NOT IN ('allocation', 'debit', 'refund', 'correction')
    OR credit_delta_microunits = 0
    OR char_length(trim(credit_reason)) NOT BETWEEN 1 AND 500
    OR char_length(credit_idempotency_key) NOT BETWEEN 8 AND 200
    OR (usage_quantity IS NOT NULL AND usage_quantity <> round(usage_quantity, 6))
  THEN
    RAISE EXCEPTION 'INVALID_CREDIT_ENTRY' USING ERRCODE = '22023';
  END IF;
  IF credit_entry_type = 'debit' AND tenant_status <> 'active' THEN
    RAISE EXCEPTION 'TENANT_INACTIVE' USING ERRCODE = 'P0001';
  END IF;

  IF credit_entry_type = 'refund' THEN
    SELECT * INTO target_debit
    FROM public.tenant_credit_ledger
    WHERE tenant_credit_ledger.id = reversed_ledger_id
      AND tenant_credit_ledger.org_id = tenant_id
      AND tenant_credit_ledger.entry_type = 'debit';
    IF NOT FOUND OR credit_delta_microunits <> -target_debit.delta_microunits THEN
      RAISE EXCEPTION 'INVALID_CREDIT_REFUND' USING ERRCODE = '22023';
    END IF;
  END IF;

  fingerprint := jsonb_build_object(
    'entry_type', credit_entry_type,
    'delta', credit_delta_microunits,
    'unit', usage_unit,
    'quantity', usage_quantity,
    'reference', usage_reference_id,
    'reversal_of', reversed_ledger_id,
    'reason', trim(credit_reason)
  )::TEXT;

  INSERT INTO public.tenant_credit_wallets(org_id) VALUES (tenant_id)
  ON CONFLICT (org_id) DO NOTHING;
  SELECT tenant_credit_wallets.balance_microunits INTO wallet_balance
  FROM public.tenant_credit_wallets
  WHERE org_id = tenant_id
  FOR UPDATE;

  SELECT * INTO existing_entry
  FROM public.tenant_credit_ledger
  WHERE tenant_credit_ledger.org_id = tenant_id
    AND tenant_credit_ledger.idempotency_key = credit_idempotency_key;
  IF FOUND THEN
    IF existing_entry.request_fingerprint <> fingerprint THEN
      RAISE EXCEPTION 'CREDIT_IDEMPOTENCY_MISMATCH' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT existing_entry.id, wallet_balance, false;
    RETURN;
  END IF;

  SELECT COALESCE(sum(delta_microunits), 0)::BIGINT INTO ledger_balance
  FROM public.tenant_credit_ledger
  WHERE tenant_credit_ledger.org_id = tenant_id;
  IF ledger_balance <> wallet_balance THEN
    RAISE EXCEPTION 'CREDIT_LEDGER_DIVERGENCE' USING ERRCODE = '55000';
  END IF;
  IF wallet_balance + credit_delta_microunits < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_TENANT_CREDITS' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.tenant_credit_ledger (
    org_id,
    actor_user_id,
    entry_type,
    delta_microunits,
    billable_unit,
    quantity,
    reason,
    idempotency_key,
    request_fingerprint,
    reference_id,
    reversal_of
  ) VALUES (
    tenant_id,
    actor_user_id,
    credit_entry_type,
    credit_delta_microunits,
    usage_unit,
    usage_quantity,
    trim(credit_reason),
    credit_idempotency_key,
    fingerprint,
    usage_reference_id,
    reversed_ledger_id
  ) RETURNING * INTO created_entry;

  UPDATE public.tenant_credit_wallets
  SET balance_microunits = wallet_balance + credit_delta_microunits, updated_at = now()
  WHERE org_id = tenant_id;

  RETURN QUERY SELECT created_entry.id, wallet_balance + credit_delta_microunits, true;
END;
$$;

REVOKE ALL ON FUNCTION public.post_tenant_credit_entry(UUID, UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_tenant_credit_entry(UUID, UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_tenant_credit_wallet(tenant_id UUID)
RETURNS TABLE (
  balance_microunits BIGINT,
  ledger_balance_microunits BIGINT,
  consistent BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(wallet.balance_microunits, 0),
    COALESCE(ledger.total, 0),
    COALESCE(wallet.balance_microunits, 0) = COALESCE(ledger.total, 0)
  FROM (SELECT 1) seed
  LEFT JOIN public.tenant_credit_wallets wallet ON wallet.org_id = tenant_id
  LEFT JOIN (
    SELECT sum(delta_microunits)::BIGINT AS total
    FROM public.tenant_credit_ledger
    WHERE org_id = tenant_id
  ) ledger ON true;
$$;

REVOKE ALL ON FUNCTION public.reconcile_tenant_credit_wallet(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_tenant_credit_wallet(UUID)
  TO service_role;
