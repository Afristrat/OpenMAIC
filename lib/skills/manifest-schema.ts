import { z } from 'zod';
import { PROMPT_IDS } from '@/lib/prompts';
import type { Skill } from './types';

const promptIds = new Set<string>(Object.values(PROMPT_IDS));

const localizedText = z.union([
  z.string().min(1).max(20_000),
  z.record(z.string().min(2).max(12), z.string().min(1).max(20_000)),
]);

const skillManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/),
    name: localizedText,
    description: localizedText,
    category: z.enum(['pedagogy', 'domain', 'interaction', 'assessment']),
    version: z.string().min(1).max(40),
    author: z.string().min(1).max(160),
    traceability: z
      .object({
        source: z.string().min(1).max(240),
        vectors: z
          .array(z.string().regex(/^V-\d{2}$/))
          .min(1)
          .max(20),
        validatedAt: z.string().date(),
        publicationManifest: z.string().min(1).max(240),
      })
      .strict()
      .optional(),
    agents: z
      .array(
        z.object({
          id: z.string().min(1).max(120),
          name: z.record(z.string(), z.string().min(1).max(160)),
          role: z.string().min(1).max(60),
          persona: z.record(z.string(), z.string().min(1).max(20_000)),
          avatar: z.string().max(2_048),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          priority: z.number().int().min(1).max(10),
          allowedActions: z.array(z.string().min(1).max(80)).max(100),
        }),
      )
      .max(20),
    promptOverrides: z
      .array(
        z.object({
          promptId: z.string().min(1).max(120),
          systemPromptAppend: z.string().max(20_000),
          variables: z.record(z.string().max(120), z.string().max(10_000)),
        }),
      )
      .max(50),
    classroomTemplates: z
      .array(
        z.object({
          id: z.string().min(1).max(120),
          name: z.record(z.string(), z.string().min(1).max(160)),
          description: z.record(z.string(), z.string().max(2_000)),
          requirement: z.string().min(1).max(20_000),
          agentIds: z.array(z.string().min(1).max(120)).max(20),
          language: z.string().min(2).max(12),
        }),
      )
      .max(50),
    sceneDefaults: z.record(z.string(), z.unknown()),
    requiredProviders: z.array(z.string().min(1).max(120)).max(50),
    supportedLanguages: z.array(z.string().min(2).max(12)).min(1).max(20),
  })
  .strict();

export function parseSkillManifest(
  input: unknown,
  options: { allowFileReferences?: boolean } = {},
): { success: true; skill: Skill } | { success: false; errors: string[] } {
  const parsed = skillManifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }
  if (
    !options.allowFileReferences &&
    parsed.data.promptOverrides.some((override) => override.systemPromptAppend.startsWith('file:'))
  ) {
    return { success: false, errors: ['promptOverrides: file references are not allowed'] };
  }
  const invalidPrompt = parsed.data.promptOverrides.find(
    (override) => !promptIds.has(override.promptId),
  );
  if (invalidPrompt) {
    return {
      success: false,
      errors: [`promptOverrides: unknown promptId "${invalidPrompt.promptId}"`],
    };
  }
  const agentIds = new Set(parsed.data.agents.map((agent) => agent.id));
  const missingAgentId = parsed.data.classroomTemplates
    .flatMap((template) => template.agentIds)
    .find((agentId) => !agentIds.has(agentId));
  if (missingAgentId) {
    return {
      success: false,
      errors: [`classroomTemplates: unknown agentId "${missingAgentId}"`],
    };
  }
  return { success: true, skill: parsed.data as Skill };
}
