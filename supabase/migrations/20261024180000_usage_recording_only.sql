-- P0.A : indicateur de tenant interne « usage_recording_only ».
--
-- Un tenant marqué conserve toute la mesure d'usage (réservation, règlement, valorisation,
-- lignes du grand livre) mais le débit n'est plus refusé faute de solde : son solde peut
-- devenir négatif. Désactivé par défaut. Aucun tenant n'est marqué par cette migration ;
-- la décision de marquer un tenant appartient à Amine (SOP-015).
--
-- Annulation : impossible tant qu'un portefeuille est négatif (allouer d'abord des crédits,
-- puis désactiver l'indicateur, puis recréer le CHECK balance_microunits >= 0).

ALTER TABLE public.tenant_billing_controls
  ADD COLUMN usage_recording_only BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN usage_recording_only_by UUID,
  ADD COLUMN usage_recording_only_at TIMESTAMPTZ,
  ADD COLUMN usage_recording_only_reason TEXT,
  ADD CONSTRAINT tenant_billing_controls_recording_only_check CHECK (
    (NOT usage_recording_only AND usage_recording_only_by IS NULL
      AND usage_recording_only_at IS NULL AND usage_recording_only_reason IS NULL)
    OR (usage_recording_only AND usage_recording_only_by IS NOT NULL
      AND usage_recording_only_at IS NOT NULL
      AND char_length(trim(usage_recording_only_reason)) BETWEEN 1 AND 500)
  );

CREATE TABLE public.tenant_usage_recording_only_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 1 AND 500),
  balance_microunits BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX tenant_usage_recording_only_events_org_idx
  ON public.tenant_usage_recording_only_events(org_id, created_at DESC);
ALTER TABLE public.tenant_usage_recording_only_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_usage_recording_only_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tenant_usage_recording_only_events TO service_role;

-- Le CHECK de colonne ne peut pas lire l'indicateur d'une autre table : la règle
-- « jamais négatif sauf tenant interne » passe dans le trigger du portefeuille.
DO $$
DECLARE constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name FROM pg_constraint
  WHERE conrelid = 'public.tenant_credit_wallets'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%balance_microunits >= 0%';
  IF constraint_name IS NULL THEN
    RAISE EXCEPTION 'WALLET_BALANCE_CHECK_NOT_FOUND';
  END IF;
  EXECUTE format('ALTER TABLE public.tenant_credit_wallets DROP CONSTRAINT %I', constraint_name);
END;
$$;

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
  IF TG_OP = 'INSERT' THEN
    IF NEW.balance_microunits <> 0 THEN
      RAISE EXCEPTION 'CREDIT_WALLET_MUST_START_EMPTY' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  SELECT COALESCE(sum(delta_microunits), 0)::BIGINT INTO ledger_balance
  FROM public.tenant_credit_ledger
  WHERE tenant_credit_ledger.org_id = NEW.org_id;
  IF NEW.balance_microunits <> ledger_balance THEN
    RAISE EXCEPTION 'CREDIT_LEDGER_DIVERGENCE'
      USING ERRCODE = '55000',
      DETAIL = format(
        'wallet balance %s differs from ledger balance %s',
        NEW.balance_microunits,
        ledger_balance
      );
  END IF;
  IF NEW.balance_microunits < 0 AND NOT COALESCE((
    SELECT controls.usage_recording_only
    FROM public.tenant_billing_controls AS controls
    WHERE controls.org_id = NEW.org_id
  ), false) THEN
    RAISE EXCEPTION 'CREDIT_WALLET_NEGATIVE_FORBIDDEN' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Seul changement par rapport à 00053 : le refus de solde insuffisant ne s'applique pas
-- à un débit d'un tenant dont l'usage est seulement enregistré.
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
  recording_only BOOLEAN;
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
  SELECT controls.usage_recording_only INTO recording_only
  FROM public.tenant_billing_controls AS controls
  WHERE controls.org_id = tenant_id;
  -- Une écriture qui améliore le solde (remboursement, allocation) n'est jamais refusée :
  -- un tenant marqué et déjà négatif doit pouvoir régler et libérer ses réservations.
  IF wallet_balance + credit_delta_microunits < 0
    AND credit_delta_microunits < 0
    AND NOT (credit_entry_type = 'debit' AND COALESCE(recording_only, false))
  THEN
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

CREATE FUNCTION public.set_tenant_usage_recording_only(
  p_actor UUID,
  p_org_id UUID,
  p_enabled BOOLEAN,
  p_reason TEXT
)
RETURNS public.tenant_billing_controls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE configured public.tenant_billing_controls;
DECLARE wallet_balance BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
    OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id)
    OR p_enabled IS NULL
    OR p_reason IS NULL
    OR char_length(trim(p_reason)) NOT BETWEEN 1 AND 500
  THEN RAISE EXCEPTION 'INVALID_BILLING_ACTOR_OR_TENANT' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::TEXT || '|billing-control', 0));
  INSERT INTO public.tenant_credit_wallets(org_id) VALUES (p_org_id)
  ON CONFLICT (org_id) DO NOTHING;
  SELECT wallets.balance_microunits INTO wallet_balance
  FROM public.tenant_credit_wallets AS wallets WHERE wallets.org_id = p_org_id FOR UPDATE;
  IF NOT p_enabled AND wallet_balance < 0
  THEN RAISE EXCEPTION 'USAGE_RECORDING_ONLY_NEGATIVE_BALANCE' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.tenant_billing_controls SET
    usage_recording_only = p_enabled,
    usage_recording_only_by = CASE WHEN p_enabled THEN p_actor END,
    usage_recording_only_at = CASE WHEN p_enabled THEN clock_timestamp() END,
    usage_recording_only_reason = CASE WHEN p_enabled THEN trim(p_reason) END,
    updated_by = p_actor,
    updated_at = clock_timestamp()
  WHERE org_id = p_org_id
  RETURNING * INTO configured;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_BILLING_CONTROL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.tenant_usage_recording_only_events(
    org_id, actor_user_id, enabled, reason, balance_microunits
  ) VALUES (p_org_id, p_actor, p_enabled, trim(p_reason), wallet_balance);
  RETURN configured;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_usage_recording_only(UUID, UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_usage_recording_only(UUID, UUID, BOOLEAN, TEXT)
  TO service_role;
