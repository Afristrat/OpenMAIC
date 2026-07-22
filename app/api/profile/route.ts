/**
 * Rich Profile API (culture, langue d'interface, préférences — S2-001)
 *
 * GET   /api/profile — état du flag `rich_profile` + valeurs actuelles
 * PATCH /api/profile — met à jour culture / ui_language / preferences
 *
 * Gated par le feature flag `rich_profile` (lib/flags) : tant qu'il n'est
 * pas activé, GET répond `richProfileEnabled: false` (le client masque la
 * section) et PATCH répond 403. Écrit dans `public.user_profiles` (migration
 * 00029), distincte de `public.profiles` qui est lisible entre collègues pour
 * les besoins de l'organisation. Ses policies n'autorisent que
 * `auth.uid() = user_id`.
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { isFeatureEnabled } from '@/lib/flags';
import { validateBody } from '@/lib/api/validate';
import { profilePatchSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/logger';

const log = createLogger('ProfileAPI');

const DEFAULT_CULTURE = 'ma-fr';
const DEFAULT_UI_LANGUAGE = 'fr-FR';

export async function GET(_request: NextRequest): Promise<Response> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Authentication required');
  }

  const richProfileEnabled = await isFeatureEnabled('rich_profile');
  if (!richProfileEnabled) {
    return apiSuccess({ richProfileEnabled: false });
  }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('culture, ui_language, preferences')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to fetch profile', error.message);
  }

  return apiSuccess({
    richProfileEnabled: true,
    culture: profile?.culture ?? DEFAULT_CULTURE,
    uiLanguage: profile?.ui_language ?? DEFAULT_UI_LANGUAGE,
    preferences: profile?.preferences ?? {},
  });
}

export async function PATCH(request: NextRequest): Promise<Response> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Authentication required');
  }

  const richProfileEnabled = await isFeatureEnabled('rich_profile');
  if (!richProfileEnabled) {
    return apiError(API_ERROR_CODES.PROVIDER_DISABLED, 403, 'Le profil enrichi est désactivé');
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }

  const validation = validateBody(profilePatchSchema, rawBody);
  if (!validation.success) return validation.response;
  const { culture, uiLanguage, preferences } = validation.data;

  if (culture === undefined && uiLanguage === undefined && preferences === undefined) {
    return apiError(
      API_ERROR_CODES.MISSING_REQUIRED_FIELD,
      400,
      'At least one of culture, uiLanguage, preferences is required',
    );
  }

  const { data: updated, error } = await supabase
    .from('user_profiles')
    .upsert(
      {
        user_id: user.id,
        ...(culture !== undefined ? { culture } : {}),
        ...(uiLanguage !== undefined ? { ui_language: uiLanguage } : {}),
        ...(preferences !== undefined ? { preferences } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('culture, ui_language, preferences')
    .single();

  if (error || !updated) {
    log.error('Failed to update rich profile', error?.message);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to update profile',
      error?.message,
    );
  }

  return apiSuccess({
    richProfileEnabled: true,
    culture: updated.culture,
    uiLanguage: updated.ui_language,
    preferences: updated.preferences,
  });
}
