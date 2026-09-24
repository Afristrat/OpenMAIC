/**
 * Agent Profiles Generation API
 *
 * Generates agent profiles (teacher, assistant, student) for a course stage
 * based on stage info and scene outlines.
 */

import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { AGENT_COLOR_PALETTE } from '@/lib/constants/agent-defaults';
import { normalizeVoiceDesign } from '@/lib/audio/voice-design';
import { requireSuperAdminOrOrgAuthor } from '@/lib/api/auth';
import { runWithUsageMeteringContext } from '@/lib/billing/usage-context';
import { learningDesignFromSettings, type AgentGender } from '@/lib/agents/persona-catalog';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const log = createLogger('Agent Profiles API');

export const maxDuration = 120;

interface RequestBody {
  orgId?: string;
  stageInfo: { name: string; description?: string };
  sceneOutlines?: { title: string; description?: string }[];
  languageDirective: string;
  availableAvatars: string[];
  avatarDescriptions?: Array<{ path: string; desc: string }>;
  availableVoices?: Array<{
    providerId: string;
    voiceId: string;
    voiceName: string;
    voiceLanguage?: string;
  }>;
}

function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  // Remove markdown code fences (```json ... ``` or ``` ... ```)
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return cleaned.trim();
}

function voiceDesignForGender(value: unknown, gender: AgentGender) {
  const design = normalizeVoiceDesign(value);
  if (!design) return undefined;
  const identity = design.identity.toLocaleLowerCase();
  const male = /\b(male|man|homme|masculin)\b/u.test(identity);
  const female = /\b(female|woman|femme|féminin|feminin)\b/u.test(identity);
  if (gender === 'male' ? !male || female : !female || male) return undefined;
  return design;
}

export async function POST(req: NextRequest) {
  let stageName: string | undefined;
  let modelString: string | undefined;
  try {
    const body = (await req.json()) as RequestBody;
    const {
      stageInfo,
      sceneOutlines,
      languageDirective,
      availableAvatars,
      avatarDescriptions,
      availableVoices,
    } = body;
    const orgId = body.orgId?.trim();
    stageName = stageInfo?.name;

    // ── Validate required fields ──
    if (!stageInfo?.name) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageInfo.name is required');
    }
    if (!languageDirective) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'languageDirective is required');
    }
    if (!availableAvatars || availableAvatars.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'availableAvatars is required and must not be empty',
      );
    }
    if (!orgId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Organization is required');
    }
    const auth = await requireSuperAdminOrOrgAuthor(req, orgId);
    if (auth.response) return auth.response;

    const { data: organization, error: organizationError } = await createServiceSupabaseClient()
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .maybeSingle();
    if (organizationError) throw new Error('Organization settings lookup failed');
    if (!organization) return apiError('INVALID_REQUEST', 404, 'Organization not found');
    const tenantPersonas = learningDesignFromSettings(organization.settings).personas;

    // ── Model resolution from request headers/body ──
    const {
      model: languageModel,
      modelString: _modelString,
      thinkingConfig,
    } = await resolveModelFromRequest(req, body, 'agent-profiles');
    modelString = _modelString;

    // ── Build prompt ──
    const sceneSummary = sceneOutlines?.length
      ? sceneOutlines
          .map((s, i) => `${i + 1}. ${s.title}${s.description ? ` — ${s.description}` : ''}`)
          .join('\n')
      : null;

    const systemPrompt = `You are an expert instructional designer. Generate exactly 10 agent profiles for a multi-agent classroom simulation, one for each supplied learning mechanism. Return ONLY valid JSON, no markdown or explanation.`;

    // Build voice list for prompt (if available)
    const voiceListStr =
      availableVoices && availableVoices.length > 0
        ? JSON.stringify(
            availableVoices.map((v) => ({
              id: `${v.providerId}::${v.voiceId}`,
              name: v.voiceName,
              language: v.voiceLanguage || 'unknown',
            })),
          )
        : '';

    const voicePrompt = voiceListStr
      ? `- Each agent should be assigned a voice that matches their persona from this list: ${voiceListStr}
  - Prefer a voice whose language matches the course language directive
  - Pick a voice that suits the agent's personality and role (e.g. authoritative voice for teacher, lively voice for energetic student)
  - Try to use different voices for each agent`
      : '';

    const voiceJsonField = voiceListStr
      ? ',\n      "voice": "string (voice id from available list, e.g. \'qwen-tts::Cherry\')"'
      : '';

    const userPrompt = `Generate agent profiles for the following course:

Course name: ${stageInfo.name}
${stageInfo.description ? `Course description: ${stageInfo.description}` : ''}
${sceneSummary ? `\nScene outlines:\n${sceneSummary}\n` : ''}
Requirements:
- Return exactly 10 agents, one for every mechanism in this tenant roster: ${JSON.stringify(tenantPersonas.map(({ id, label, role, defaultName, gender, persona }) => ({ id, label, role, defaultName, gender, persona })))}
- Use each mechanismId exactly once and never invent another mechanismId
- Exactly 1 agent must have role "teacher", the rest can be "assistant" or "student"
- Priority values: teacher=10 (highest), assistant=7, student=4-6
- Each agent needs: name, role, persona (2-3 sentences describing personality and teaching/learning style)
- Language directive for this course: ${languageDirective}
  Agent names and personas must follow this language directive.
- Each agent must be assigned one avatar from this list: ${JSON.stringify(avatarDescriptions && avatarDescriptions.length > 0 ? avatarDescriptions.map((a) => ({ path: a.path, description: a.desc })) : availableAvatars)}
  - Pick an avatar that visually matches the agent's personality and role
  - Try to use different avatars for each agent
  - Use the "path" value as the avatar field in the output
- Each agent must be assigned one color from this list: ${JSON.stringify(AGENT_COLOR_PALETTE)}
  - Each agent must have a different color
- Each agent needs a "voiceDesign" object describing their VOCAL identity (not personality), written following the language directive and consistent with the persona, as three short comma-free phrases:
  - "identity": gender + age + role (e.g. "middle-aged male teacher")
  - "texture": pitch + vocal quality (e.g. "warm low-pitched slightly husky")
  - "delivery": emotion + pace (e.g. "calm measured encouraging")
  - CRITICAL: the gender stated in "identity" MUST match the gender the agent's "name" reads as (e.g. a name that reads male, such as "Thomas" or "Ahmed", must get a male "identity"; a name that reads female, such as "Sophie" or "Amina", must get a female "identity"). A mismatch between name and voice gender is a serious quality bug — double-check every agent's name against its voiceDesign before returning the JSON.
${voicePrompt}${
      voicePrompt
        ? '\n  - CRITICAL: the picked voice\'s gender must also match the gender the agent\'s "name" reads as.'
        : ''
    }

Return a JSON object with this exact structure:
{
  "agents": [
    {
      "mechanismId": "string (id from the supplied mechanism roster)",
      "name": "string",
      "role": "teacher" | "assistant" | "student",
      "persona": "string (2-3 sentences)",
      "voiceDesign": { "identity": "string", "texture": "string", "delivery": "string" },
      "avatar": "string (from available list)",
      "color": "string (hex color from palette)",
      "priority": number (10 for teacher, 7 for assistant, 4-6 for student)${voiceJsonField}
    }
  ]
}`;

    log.info(`Generating agent profiles for "${stageInfo.name}" [model=${modelString}]`);

    const rawResult = (
      await runWithUsageMeteringContext(req.headers, auth.user.id, orgId, () =>
        callLLM(
          {
            model: languageModel,
            system: systemPrompt,
            prompt: userPrompt,
          },
          'agent-profiles',
          undefined,
          thinkingConfig,
        ),
      )
    ).text;

    // ── Parse LLM response ──
    const rawText = stripCodeFences(rawResult);
    let parsed: {
      agents: Array<{
        name: string;
        role: string;
        persona: string;
        avatar: string;
        color: string;
        priority: number;
        mechanismId?: string;
        voice?: string;
        voiceDesign?: unknown;
      }>;
    };

    try {
      parsed = JSON.parse(rawText);
    } catch {
      log.error('Failed to parse LLM response as JSON:', rawText.substring(0, 500));
      return apiError('PARSE_FAILED', 500, 'Failed to parse agent profiles from LLM response');
    }

    // ── Validate parsed structure ──
    if (!parsed.agents || !Array.isArray(parsed.agents) || parsed.agents.length < 1) {
      log.error(`Expected agent profiles, got ${parsed.agents?.length ?? 0}`);
      return apiError('GENERATION_FAILED', 500, 'The provider returned no usable agent profile');
    }

    // The provider adapts each persona to the course, but the platform owns the
    // ten identities. Reconciliation against the canonical roster prevents a
    // partial response, invented mechanism or name/avatar/voice drift from
    // breaking the contract exposed on the landing page.
    const byMechanism = new Map(
      parsed.agents
        .filter((agent) => tenantPersonas.some((persona) => persona.id === agent.mechanismId))
        .map((agent) => [agent.mechanismId, agent]),
    );
    const unmatchedTeachers = parsed.agents.filter((agent) => agent.role === 'teacher');
    const unmatchedOthers = parsed.agents.filter((agent) => agent.role !== 'teacher');
    let otherIndex = 0;
    const agents = tenantPersonas.map((persona, index) => {
      const adapted =
        byMechanism.get(persona.id) ??
        (persona.role === 'teacher' ? unmatchedTeachers[0] : unmatchedOthers[otherIndex++]);
      const fallbackAvatar = availableAvatars[index % availableAvatars.length];
      const avatar = availableAvatars.includes(persona.avatar)
        ? persona.avatar
        : adapted?.avatar && availableAvatars.includes(adapted.avatar)
          ? adapted.avatar
          : fallbackAvatar;
      const voiceDesign = voiceDesignForGender(adapted?.voiceDesign, persona.gender);
      return {
        id: `gen-${persona.id}-${nanoid(4)}`,
        name: persona.defaultName,
        role: persona.role,
        persona: adapted?.persona?.trim() || persona.persona,
        avatar,
        color: persona.color || AGENT_COLOR_PALETTE[index % AGENT_COLOR_PALETTE.length],
        priority: Math.max(1, Math.min(10, Math.round(persona.interactionWeights.balanced / 4))),
        mechanismId: persona.id,
        interactionWeight: persona.interactionWeights.balanced,
        gender: persona.gender,
        voiceConfig: { providerId: persona.providerId, voiceId: persona.voiceId },
        ...(voiceDesign ? { voiceDesign } : {}),
      };
    });

    log.info(`Successfully generated ${agents.length} agent profiles for "${stageInfo.name}"`);

    return apiSuccess({ agents });
  } catch (error) {
    log.error(
      `Agent profiles generation failed [stage="${stageName ?? 'unknown'}", model=${modelString ?? 'unknown'}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
