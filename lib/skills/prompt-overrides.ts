import { buildPrompt } from '@/lib/prompts';
import type { PromptId } from '@/lib/prompts/types';
import type { SkillPromptContext } from '@/lib/types/stage';
import { getPromptOverride } from './registry';

export const CORE_FORMATION_SKILL_ID = 'formation-design-pro';

/**
 * Build a normal platform prompt, then apply the active skill's declared
 * variables and system appendix. Disabled or absent context is byte-for-byte
 * equivalent to buildPrompt().
 */
export function buildPromptWithSkill(
  promptId: PromptId,
  variables: Record<string, unknown>,
  context: Partial<SkillPromptContext> = {},
): { system: string; user: string } | null {
  const activeSkillId =
    typeof context.activeSkillId === 'string' && context.activeSkillId.length <= 256
      ? context.activeSkillId
      : undefined;
  const skillIds = context.enabled === true
    ? [
        CORE_FORMATION_SKILL_ID,
        ...(activeSkillId && activeSkillId !== CORE_FORMATION_SKILL_ID
          ? [activeSkillId]
          : []),
      ]
    : [];
  const overrides = skillIds
    .map((skillId) => getPromptOverride(skillId, promptId))
    .filter((override) => override !== undefined);
  const prompts = buildPrompt(
    promptId,
    Object.assign({}, variables, ...overrides.map((override) => override.variables)),
  );
  if (!prompts) return null;

  const systemPromptAppends = overrides
    .map((override) => override.systemPromptAppend.trim())
    .filter(Boolean);
  if (systemPromptAppends.length === 0) return prompts;

  return {
    ...prompts,
    system: `${prompts.system}\n\n${systemPromptAppends.join('\n\n')}`,
  };
}
