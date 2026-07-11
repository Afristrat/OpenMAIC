/**
 * Client HTTP pour le studio Mishkāt/Hyperframes (contrat P1-B).
 *
 * Interface fichiers/API uniquement : ce module ne fait que sérialiser/désérialiser
 * du JSON via `fetch` vers l'API REST déjà déployée de Mishkāt — aucun import de
 * code depuis le repo mishkat. Contrat (lu en lecture seule dans le repo tiers,
 * `docs/RAMI-VIDEO-INTEGRATION-PROMPT.md`) :
 *   POST /v1/productions       { brief, brand? } -> 202 { id, status }
 *   GET  /v1/productions/:id   -> { status, storyboard?, variants?, error? }
 */

import { createLogger } from '@/lib/logger';
import type {
  HyperframesBrief,
  HyperframesBrandTokens,
  HyperframesCreateProductionResponse,
  HyperframesProduction,
} from './hyperframes-types';

const log = createLogger('HyperframesClient');

function getBaseUrl(): string {
  return process.env.MISHKAT_API_URL || 'https://mishkat.ai-mpower.com';
}

function getApiKey(): string | undefined {
  return process.env.MISHKAT_API_KEY || undefined;
}

/** `true` si les credentials nécessaires pour appeler Mishkāt sont configurés. */
export function isHyperframesConfigured(): boolean {
  return Boolean(getApiKey() && process.env.MISHKAT_BRAND_ID);
}

async function hyperframesFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('MISHKAT_API_KEY non configurée');
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${apiKey}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Mishkāt ${path} -> HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  return (await response.json()) as T;
}

export async function createHyperframesProduction(
  brief: HyperframesBrief,
  brand?: HyperframesBrandTokens,
): Promise<HyperframesCreateProductionResponse> {
  log.info('Creating Hyperframes production', { intent: brief.intent.slice(0, 80) });
  return hyperframesFetch<HyperframesCreateProductionResponse>('/v1/productions', {
    method: 'POST',
    body: JSON.stringify(brand ? { brief, brand } : { brief }),
  });
}

export async function getHyperframesProduction(id: string): Promise<HyperframesProduction> {
  return hyperframesFetch<HyperframesProduction>(`/v1/productions/${encodeURIComponent(id)}`);
}
