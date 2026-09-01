import { createServiceSupabaseClient } from '@/lib/supabase/service';

export const CREDIT_MICROUNITS = 1_000_000;

export type BillableUnit =
  | 'llm_input_token'
  | 'llm_output_token'
  | 'tts_second'
  | 'asr_second'
  | 'image'
  | 'video_second'
  | 'storage_byte'
  | 'operation';

export type CreditEntryType = 'allocation' | 'debit' | 'refund' | 'correction';

export type PostCreditEntry = {
  actorUserId: string;
  tenantId: string;
  entryType: CreditEntryType;
  deltaMicrounits: number;
  idempotencyKey: string;
  reason: string;
  billableUnit?: BillableUnit;
  quantity?: number;
  referenceId?: string;
  reversalOf?: string;
};

export type CreditEntryResult = {
  ledgerId: string;
  balanceMicrounits: number;
  applied: boolean;
};

type CreditRpcRow = {
  ledger_id: string;
  balance_microunits: number | string;
  applied: boolean;
};

export function creditsToMicrounits(credits: number): number {
  const microunits = Math.round(credits * CREDIT_MICROUNITS);
  if (!Number.isSafeInteger(microunits) || microunits === 0) {
    throw new Error('Invalid credit amount');
  }
  return microunits;
}

export function microunitsToCredits(microunits: number | string): number {
  return Number(microunits) / CREDIT_MICROUNITS;
}

export async function postTenantCreditEntry(
  input: PostCreditEntry,
): Promise<CreditEntryResult> {
  if (!Number.isSafeInteger(input.deltaMicrounits) || input.deltaMicrounits === 0) {
    throw new Error('Invalid credit microunits');
  }
  if (
    input.quantity !== undefined &&
    (!Number.isFinite(input.quantity) || input.quantity <= 0)
  ) {
    throw new Error('Invalid billable quantity');
  }
  const { data, error } = await createServiceSupabaseClient()
    .rpc('post_tenant_credit_entry', {
      actor_user_id: input.actorUserId,
      tenant_id: input.tenantId,
      credit_entry_type: input.entryType,
      credit_delta_microunits: input.deltaMicrounits,
      credit_idempotency_key: input.idempotencyKey,
      credit_reason: input.reason,
      usage_unit: input.billableUnit ?? null,
      usage_quantity: input.quantity ?? null,
      usage_reference_id: input.referenceId ?? null,
      reversed_ledger_id: input.reversalOf ?? null,
    })
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Credit ledger mutation failed');
  const row = data as CreditRpcRow;
  return {
    ledgerId: row.ledger_id,
    balanceMicrounits: Number(row.balance_microunits),
    applied: row.applied,
  };
}

export function debitTenantCredits(
  input: Omit<PostCreditEntry, 'entryType' | 'deltaMicrounits' | 'reversalOf'> & {
    amountMicrounits: number;
    billableUnit: BillableUnit;
    quantity: number;
    referenceId: string;
  },
): Promise<CreditEntryResult> {
  return postTenantCreditEntry({
    ...input,
    entryType: 'debit',
    deltaMicrounits: -Math.abs(input.amountMicrounits),
  });
}

export function refundTenantCreditDebit(
  input: Omit<
    PostCreditEntry,
    'entryType' | 'deltaMicrounits' | 'billableUnit' | 'quantity' | 'referenceId'
  > & { amountMicrounits: number; reversalOf: string },
): Promise<CreditEntryResult> {
  return postTenantCreditEntry({
    ...input,
    entryType: 'refund',
    deltaMicrounits: Math.abs(input.amountMicrounits),
  });
}
