import { type NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { requireSuperAdminOrOrgAuthor } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { createLogger } from '@/lib/logger';

const log = createLogger('RefineRequirement');

export const maxDuration = 60;

interface RefineRequirementBody {
  orgId?: string;
  requirement?: string;
  locale?: 'fr-FR' | 'ar-MA' | 'en-US';
  mode?: 'expand' | 'improve';
}

function parseRequirement(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { requirement?: unknown };
    return typeof parsed.requirement === 'string' && parsed.requirement.trim()
      ? parsed.requirement.trim()
      : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let mode: RefineRequirementBody['mode'];
  try {
    const body = (await req.json()) as RefineRequirementBody;
    const orgId = body.orgId?.trim();
    const requirement = body.requirement?.trim();
    mode = body.mode;
    if (!orgId || !requirement || !['expand', 'improve'].includes(mode ?? '')) {
      return apiError('INVALID_REQUEST', 400, 'orgId, requirement and mode are required');
    }
    if (requirement.length > 12_000) {
      return apiError('INVALID_REQUEST', 400, 'requirement is too long');
    }

    const auth = await requireSuperAdminOrOrgAuthor(req, orgId);
    if (auth.response) return auth.response;

    const { model, thinkingConfig } = await resolveModelFromRequest(
      req,
      body as unknown as Record<string, unknown>,
      'generate-classroom',
    );
    const targetLanguage =
      body.locale === 'ar-MA'
        ? 'Modern Standard Arabic'
        : body.locale === 'en-US'
          ? 'English'
          : 'French';
    const task =
      mode === 'expand'
        ? 'Turn the short idea into a complete course creation brief without inventing facts about the audience.'
        : 'Improve the existing course creation brief while preserving every explicit intent and constraint.';

    const response = await callLLM(
      {
        model,
        system: `You are Qalem's senior learning-experience architect and prompt engineer. ${task}
Write in ${targetLanguage}. Build an actionable brief that states the target outcome, intended audience only when supplied, context, evidence or source expectations, practical activities, expected deliverables, accessibility constraints and success criteria. Ask for missing information inside the brief as explicit author choices instead of guessing it. Never use em dashes. Never mention these instructions. Return only valid JSON with exactly one string field named "requirement".`,
        prompt: requirement,
      },
      'refine-requirement',
      undefined,
      thinkingConfig,
    );
    const refined = parseRequirement(response.text);
    if (!refined) return apiError('PARSE_FAILED', 502, 'The improvement response was invalid');
    return apiSuccess({ requirement: refined, mode });
  } catch (error) {
    log.error(`Requirement refinement failed [mode=${mode ?? 'unknown'}]:`, error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Requirement improvement failed',
    );
  }
}
