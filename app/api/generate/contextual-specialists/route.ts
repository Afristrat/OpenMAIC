import { type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import type { LanguageModel } from 'ai';
import { callLLM } from '@/lib/ai/llm';
import { requireSuperAdminOrOrgAuthor } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { createLogger } from '@/lib/logger';
import type { ContextualSpecialist } from '@/lib/agents/contextual-specialist';
import type { ThinkingConfig } from '@/lib/types/provider';
import {
  applyLocalizedTasks,
  buildOccupationalProfile,
  buildSpecialistPersona,
  ESCO_SOURCE_VERSION,
  type EscoOccupationResource,
} from '@/lib/agents/isco-profile';

const log = createLogger('ContextualSpecialists');
const ESCO_SEARCH_URL = 'https://ec.europa.eu/esco/api/search';

export const maxDuration = 120;

interface SpecialistRequest {
  orgId?: string;
  topic?: string;
  locale?: 'fr-FR' | 'ar-MA' | 'en-US';
}

interface ProposedSpecialist {
  searchTerm: string;
  displayName: string;
  reason: string;
  gender: 'female' | 'male';
}

interface EscoSearchResult {
  uri?: string;
  title?: string;
  broaderIscoGroup?: string[];
}

interface EscoSearchPayload {
  _embedded?: { results?: EscoSearchResult[] };
}

function normalizedTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('en');
}

async function fetchOccupationResource(uri: string, language: 'ar' | 'en' | 'fr') {
  const url = new URL('https://ec.europa.eu/esco/api/resource/occupation');
  url.searchParams.set('uri', uri);
  url.searchParams.set('language', language);
  url.searchParams.set('selectedVersion', ESCO_SOURCE_VERSION);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;
  return (await response.json()) as EscoOccupationResource;
}

function parseProposals(raw: string): ProposedSpecialist[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as { specialists?: unknown };
  if (!Array.isArray(parsed.specialists)) return [];
  return parsed.specialists
    .filter((item): item is ProposedSpecialist => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.searchTerm === 'string' &&
        typeof candidate.displayName === 'string' &&
        typeof candidate.reason === 'string' &&
        (candidate.gender === 'female' || candidate.gender === 'male')
      );
    })
    .slice(0, 3);
}

async function resolveOccupation(
  proposal: ProposedSpecialist,
  searchLanguage: 'fr' | 'en',
  resourceLanguage: 'ar' | 'fr' | 'en',
): Promise<ContextualSpecialist | null> {
  const url = new URL(ESCO_SEARCH_URL);
  url.searchParams.set('text', proposal.searchTerm);
  url.searchParams.set('language', searchLanguage);
  url.searchParams.set('type', 'occupation');
  url.searchParams.set('limit', '5');
  url.searchParams.set('selectedVersion', ESCO_SOURCE_VERSION);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;
  const payload = (await response.json()) as EscoSearchPayload;
  const results = payload._embedded?.results ?? [];
  const requestedTitle = normalizedTitle(proposal.searchTerm);
  const occupation =
    results.find((candidate) => normalizedTitle(candidate.title ?? '') === requestedTitle) ??
    results[0];
  const iscoUri = occupation?.broaderIscoGroup?.[0];
  const iscoCode = iscoUri?.match(/C(\d{4})$/)?.[1];
  if (!occupation?.uri || !occupation.title || !iscoCode) return null;

  const [occupationResource, unitGroupResource] = await Promise.all([
    fetchOccupationResource(occupation.uri, resourceLanguage),
    fetchOccupationResource(iscoUri, resourceLanguage),
  ]);
  if (!occupationResource || !unitGroupResource) return null;
  const occupationalProfile = buildOccupationalProfile({
    iscoCode,
    occupation: occupationResource,
    unitGroup: unitGroupResource,
    iscoUri,
  });
  if (!occupationalProfile) return null;
  const occupationTitle = occupationResource.title?.trim() || occupation.title;

  return {
    id: `specialist-${nanoid(8)}`,
    name: proposal.displayName.trim(),
    occupationTitle,
    iscoCode,
    escoUri: occupation.uri,
    reason: proposal.reason.trim(),
    gender: proposal.gender,
    avatar: proposal.gender === 'female' ? '/avatars/assist.png' : '/avatars/curious.png',
    role: 'assistant',
    persona: buildSpecialistPersona({
      name: proposal.displayName.trim(),
      occupationTitle,
      reason: proposal.reason.trim(),
      profile: occupationalProfile,
    }),
    occupationalProfile,
    voiceConfig: {
      providerId: 'higgs-tts',
      voiceId: proposal.gender === 'female' ? 'hanae' : 'younes',
    },
  };
}

function parseTaskTranslations(raw: string): Map<string, string[]> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as { translations?: unknown };
  if (!Array.isArray(parsed.translations)) return new Map();
  return new Map(
    parsed.translations.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const candidate = item as Record<string, unknown>;
      if (
        typeof candidate.id !== 'string' ||
        !Array.isArray(candidate.tasks) ||
        !candidate.tasks.every((task) => typeof task === 'string')
      ) {
        return [];
      }
      return [[candidate.id, candidate.tasks as string[]] as const];
    }),
  );
}

async function localizeSpecialistTasks(
  specialists: ContextualSpecialist[],
  locale: 'fr-FR' | 'ar-MA' | 'en-US',
  model: LanguageModel,
  thinkingConfig: ThinkingConfig | undefined,
): Promise<ContextualSpecialist[]> {
  if (locale === 'en-US' || specialists.length === 0) return specialists;
  const targetLanguage = locale === 'ar-MA' ? 'Modern Standard Arabic' : 'French';
  const translation = await callLLM(
    {
      model,
      system: `Translate the supplied official ISCO-08 tasks into ${targetLanguage}. Preserve each id, order, meaning and number of tasks exactly. Do not summarize, add, remove or merge tasks. Never use em dashes. Return only JSON: {"translations":[{"id":"...","tasks":["..."]}]}.`,
      prompt: JSON.stringify(
        specialists.map((specialist) => ({
          id: specialist.id,
          tasks: specialist.occupationalProfile.sourceTasks,
        })),
      ),
    },
    'contextual-specialists',
    undefined,
    thinkingConfig,
  );
  const translations = parseTaskTranslations(translation.text);
  return specialists.map((specialist) => {
    const localizedProfile = applyLocalizedTasks(
      specialist.occupationalProfile,
      translations.get(specialist.id) ?? [],
      locale,
    );
    if (!localizedProfile) {
      throw new Error(`Invalid ISCO task translation for ${specialist.id}`);
    }
    return {
      ...specialist,
      occupationalProfile: localizedProfile,
      persona: buildSpecialistPersona({
        name: specialist.name,
        occupationTitle: specialist.occupationTitle,
        reason: specialist.reason,
        profile: localizedProfile,
      }),
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SpecialistRequest;
    const orgId = body.orgId?.trim();
    const topic = body.topic?.trim();
    if (!orgId || !topic || topic.length < 8 || topic.length > 12_000) {
      return apiError('INVALID_REQUEST', 400, 'A valid orgId and topic are required');
    }
    const auth = await requireSuperAdminOrOrgAuthor(req, orgId);
    if (auth.response) return auth.response;

    const { model, thinkingConfig } = await resolveModelFromRequest(
      req,
      body as unknown as Record<string, unknown>,
      'generate-classroom',
    );
    const outputLanguage =
      body.locale === 'ar-MA'
        ? 'Modern Standard Arabic'
        : body.locale === 'en-US'
          ? 'English'
          : 'French';
    const result = await callLLM(
      {
        model,
        system: `You design an immersive multi-agent professional course. Identify zero to three occupations whose real-world expertise would materially improve the topic. Do not replace the permanent pedagogical personas. Avoid decorative or redundant experts. Each searchTerm must be a concise occupation title in ${body.locale === 'fr-FR' ? 'French' : 'English'} suitable for an ESCO occupation search. displayName and reason must be in ${outputLanguage}. Use culturally plausible first names and align each name with the declared binary voice gender. Never use em dashes. Return only JSON: {"specialists":[{"searchTerm":"...","displayName":"...","reason":"...","gender":"female|male"}]}.`,
        prompt: topic,
      },
      'contextual-specialists',
      undefined,
      thinkingConfig,
    );
    const proposals = parseProposals(result.text);
    const resolved = await Promise.all(
      proposals.map((proposal) =>
        resolveOccupation(
          proposal,
          body.locale === 'fr-FR' ? 'fr' : 'en',
          body.locale === 'fr-FR' ? 'fr' : body.locale === 'ar-MA' ? 'ar' : 'en',
        ),
      ),
    );
    const groundedSpecialists = resolved.filter(
      (specialist): specialist is ContextualSpecialist => specialist !== null,
    );
    const specialists = await localizeSpecialistTasks(
      groundedSpecialists,
      body.locale ?? 'fr-FR',
      model,
      thinkingConfig,
    );
    return apiSuccess({ specialists, reference: `ISCO-08 via ESCO ${ESCO_SOURCE_VERSION}` });
  } catch (error) {
    log.error('Contextual specialist generation failed:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Specialist generation failed',
    );
  }
}
