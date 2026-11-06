/**
 * Clés d'API personnelles (table user_api_keys) : une personne utilise son propre compte chez un
 * fournisseur de modèles à la place de celui de la plateforme.
 *
 * La clé est chiffrée (secret-box), jamais relue par un client : l'écran ne reçoit que le
 * fournisseur et les quatre derniers caractères. Elle ne s'applique qu'à l'adresse officielle du
 * fournisseur : aucune adresse saisie par la personne, donc aucune clé envoyée ailleurs.
 */

import { generateText } from 'ai';
import { PROVIDERS, getModel } from '@/lib/ai/providers';
import { openSecret, sealSecret } from '@/lib/server/secret-box';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export type PersonalKeyKind = 'llm';

export type PersonalKeySummary = { providerId: string; hint: string; updatedAt: string };

export class PersonalKeyError extends Error {
  constructor(
    readonly code: 'UNKNOWN_PROVIDER' | 'INVALID_KEY' | 'KEY_REJECTED' | 'VERIFY_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'PersonalKeyError';
  }
}

/** Fournisseurs de modèles qui acceptent une clé personnelle : ceux du registre qui en exigent une. */
export function personalKeyProviders(): { id: string; name: string }[] {
  return Object.values(PROVIDERS)
    .filter((provider) => provider.requiresApiKey && Boolean(provider.defaultBaseUrl))
    .map((provider) => ({ id: provider.id, name: provider.name }));
}

export function isPersonalKeyProvider(providerId: string): boolean {
  return personalKeyProviders().some((provider) => provider.id === providerId);
}

/** Clé nettoyée : 8 à 512 caractères imprimables, sans espace ni retour à la ligne. */
export function parseApiKey(value: unknown): string {
  if (typeof value !== 'string') throw new PersonalKeyError('INVALID_KEY', 'Invalid key');
  const key = value.trim();
  if (key.length < 8 || key.length > 512 || !/^[\x21-\x7e]+$/.test(key)) {
    throw new PersonalKeyError('INVALID_KEY', 'Invalid key');
  }
  return key;
}

/**
 * Essai réel de la clé chez le fournisseur : une génération de quelques jetons, non facturée par
 * la plateforme (la clé est celle de la personne). Un refus d'authentification est distingué d'une
 * panne du fournisseur, qui ne dit rien de la clé.
 */
export async function verifyPersonalKey(providerId: string, apiKey: string): Promise<void> {
  const provider = Object.values(PROVIDERS).find((candidate) => candidate.id === providerId);
  const modelId = provider?.models[0]?.id;
  if (!provider || !modelId) throw new PersonalKeyError('UNKNOWN_PROVIDER', 'Unknown provider');
  const { model } = getModel({
    providerId: provider.id,
    modelId,
    apiKey,
    baseUrl: provider.defaultBaseUrl,
  });
  try {
    await generateText({
      model,
      prompt: 'OK',
      maxOutputTokens: 16,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const status = (error as { statusCode?: unknown } | null)?.statusCode;
    if (status === 401 || status === 403) {
      throw new PersonalKeyError('KEY_REJECTED', 'Key rejected by the provider');
    }
    throw new PersonalKeyError('VERIFY_UNAVAILABLE', 'Provider unavailable');
  }
}

export async function savePersonalKey(input: {
  userId: string;
  kind: PersonalKeyKind;
  providerId: string;
  apiKey: string;
}): Promise<void> {
  if (!isPersonalKeyProvider(input.providerId)) {
    throw new PersonalKeyError('UNKNOWN_PROVIDER', 'Unknown provider');
  }
  const sealed = sealSecret(input.apiKey);
  const { error } = await createServiceSupabaseClient()
    .from('user_api_keys')
    .upsert({
      user_id: input.userId,
      kind: input.kind,
      provider_id: input.providerId,
      key_ciphertext: sealed.ciphertext,
      key_iv: sealed.iv,
      key_tag: sealed.tag,
      key_hint: input.apiKey.slice(-4),
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(`Personal key save failed: ${error.message}`);
}

export async function listPersonalKeys(
  userId: string,
  kind: PersonalKeyKind,
): Promise<PersonalKeySummary[]> {
  const { data, error } = await createServiceSupabaseClient()
    .from('user_api_keys')
    .select('provider_id, key_hint, updated_at')
    .eq('user_id', userId)
    .eq('kind', kind)
    .order('provider_id');
  if (error) throw new Error(`Personal keys lookup failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    providerId: row.provider_id,
    hint: row.key_hint,
    updatedAt: row.updated_at,
  }));
}

export async function deletePersonalKey(
  userId: string,
  kind: PersonalKeyKind,
  providerId: string,
): Promise<boolean> {
  const { data, error } = await createServiceSupabaseClient()
    .from('user_api_keys')
    .delete()
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('provider_id', providerId)
    .select('provider_id');
  if (error) throw new Error(`Personal key delete failed: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Clé en clair d'une personne pour un fournisseur, ou null. Réservé au serveur. */
export async function readPersonalKey(
  userId: string,
  kind: PersonalKeyKind,
  providerId: string,
): Promise<string | null> {
  const { data, error } = await createServiceSupabaseClient()
    .from('user_api_keys')
    .select('key_ciphertext, key_iv, key_tag')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('provider_id', providerId)
    .maybeSingle();
  if (error) throw new Error(`Personal key lookup failed: ${error.message}`);
  if (!data) return null;
  return openSecret({
    ciphertext: data.key_ciphertext,
    iv: data.key_iv,
    tag: data.key_tag,
  });
}
