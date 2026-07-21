import { PROMPT_IDS, buildPrompt } from '@/lib/prompts';
import { parseJsonResponse } from './json-repair';
import type { AICallFn } from './pipeline-types';
import type { SceneOutline } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

const log = createLogger('WebCapturePlan');

export interface CaptureInteractionStep {
  action: 'click' | 'scroll' | 'wait';
  selector?: string;
  ms?: number;
}

export interface CaptureDecision {
  needsCapture: boolean;
  url: string;
  interactionSteps: CaptureInteractionStep[];
  format: 'image' | 'video';
  reason: string;
}

function isValidDecision(value: unknown): value is CaptureDecision {
  if (!value || typeof value !== 'object') return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.needsCapture === 'boolean' &&
    typeof d.url === 'string' &&
    Array.isArray(d.interactionSteps) &&
    (d.format === 'image' || d.format === 'video') &&
    typeof d.reason === 'string'
  );
}

/**
 * Decide, for a single scene outline, whether a web capture of a real
 * tool/product would illustrate it better than a text-only slide. Returns
 * `null` on any parse/validation failure — callers must treat that exactly
 * like `needsCapture: false` (never block scene generation on this).
 */
export async function decideCaptureForScene(
  outline: SceneOutline,
  aiCall: AICallFn,
  languageDirective?: string,
): Promise<CaptureDecision | null> {
  const prompts = buildPrompt(PROMPT_IDS.CAPTURE_DECISION, {
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    languageDirective: languageDirective || '',
  });
  if (!prompts) return null;

  const response = await aiCall(prompts.system, prompts.user);
  const decision = parseJsonResponse<CaptureDecision>(response);

  if (!isValidDecision(decision)) {
    log.error(`Failed to parse capture-decision response for: ${outline.title}`);
    return null;
  }

  if (decision.needsCapture) {
    const ssrfError = await validateUrlForSSRF(decision.url);
    if (ssrfError) {
      log.warn(`capture-decision URL rejected by ssrf-guard for "${outline.title}": ${ssrfError}`);
      return {
        ...decision,
        needsCapture: false,
        reason: `URL rejetée par ssrf-guard: ${ssrfError}`,
      };
    }
  }

  return decision;
}
