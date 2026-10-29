/**
 * Préférences de l'extension de capture et modèle courant du compte (table capture_preferences).
 *
 * Le mode, la narration et la langue viennent de l'extension ; le modèle vient de l'application
 * Qalem et n'est jamais accepté de l'extension. Écriture par le service seulement.
 */

import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export const preferencesPatchSchema = z
  .strictObject({
    captureMode: z.enum(['simple', 'ai']),
    narration: z.boolean(),
    writingLanguage: z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4})?$/),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Aucune préférence à enregistrer');

export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>;

export type CapturePreferences = {
  captureMode: 'simple' | 'ai' | null;
  narration: boolean;
  writingLanguage: string | null;
  accountModel: string | null;
};

type Row = {
  capture_mode: 'simple' | 'ai' | null;
  narration: boolean;
  writing_language: string | null;
  account_model: string | null;
};

export async function readCapturePreferences(ownerId: string): Promise<CapturePreferences> {
  const { data, error } = await createServiceSupabaseClient()
    .from('capture_preferences')
    .select('capture_mode, narration, writing_language, account_model')
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw new Error('Capture preferences unavailable');
  const row = data as Row | null;
  return {
    captureMode: row?.capture_mode ?? null,
    narration: row?.narration ?? false,
    writingLanguage: row?.writing_language ?? null,
    accountModel: row?.account_model ?? null,
  };
}

async function upsert(ownerId: string, columns: Record<string, unknown>): Promise<void> {
  const { error } = await createServiceSupabaseClient()
    .from('capture_preferences')
    .upsert(
      { owner_id: ownerId, ...columns, updated_at: new Date().toISOString() },
      { onConflict: 'owner_id' },
    );
  if (error) throw new Error('Capture preferences not saved');
}

export function saveCapturePreferences(ownerId: string, patch: PreferencesPatch): Promise<void> {
  return upsert(ownerId, {
    ...(patch.captureMode !== undefined && { capture_mode: patch.captureMode }),
    ...(patch.narration !== undefined && { narration: patch.narration }),
    ...(patch.writingLanguage !== undefined && { writing_language: patch.writingLanguage }),
  });
}

export function saveAccountModel(userId: string, model: string): Promise<void> {
  return upsert(userId, { account_model: model, account_model_at: new Date().toISOString() });
}
