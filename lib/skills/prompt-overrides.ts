import { buildPrompt } from '@/lib/prompts';
import type { PromptId } from '@/lib/prompts/types';
import { getPromptOverride } from './registry';

export interface SkillPromptContext {
  enabled?: boolean;
  activeSkillId?: string;
}

/**
 * Build a normal platform prompt, then apply the active skill's declared
 * variables and system appendix. Disabled or absent context is byte-for-byte
 * equivalent to buildPrompt().
 */
export function buildPromptWithSkill(
  promptId: PromptId,
  variables: Record<string, unknown>,
  context: SkillPromptContext = {},
): { system: string; user: string } | null {
  const override =
    context.enabled && context.activeSkillId
      ? getPromptOverride(context.activeSkillId, promptId)
      : undefined;
  const prompts = buildPrompt(
    promptId,
    override ? { ...variables, ...override.variables } : variables,
  );
  if (!prompts || !override?.systemPromptAppend.trim()) return prompts;

  return {
    ...prompts,
    system: `${prompts.system}\n\n${override.systemPromptAppend.trim()}`,
  };
}
