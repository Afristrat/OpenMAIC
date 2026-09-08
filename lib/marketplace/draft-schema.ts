import { z } from 'zod';
import { TTS_PROVIDERS } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';
import { SLIDE_ACTIONS, WHITEBOARD_ACTIONS } from '@/lib/orchestration/registry/types';

const actions = new Set([...SLIDE_ACTIONS, ...WHITEBOARD_ACTIONS]);

const text = z.string().max(4000);
const textList = z.array(text).max(1000);
const sourceUrl = z
  .url()
  .max(2000)
  .regex(/^https?:\/\//);

export const agentProfileExtensionsSchema = z.object({
  interactionWeight: z.number().min(0).max(100).optional(),
  mechanismId: z.string().min(1).max(200).optional(),
  gender: z.enum(['female', 'male']).optional(),
  voiceDesign: z.object({ identity: text, texture: text, delivery: text }).strict().optional(),
  occupationalProfile: z
    .object({
      standard: z.literal('ISCO-08'),
      unitGroupCode: z.string().regex(/^\d{4}$/),
      unitGroupTitle: text,
      occupationDescription: text,
      tasks: textList,
      sourceTasks: textList,
      taskLocale: z.enum(['fr-FR', 'ar-MA', 'en-US']),
      sourceVersion: z.literal('v1.2.1'),
      essentialSkills: textList,
      knowledge: textList,
      iscoUri: sourceUrl,
      occupationUri: sourceUrl,
      sourceUrl,
    })
    .strict()
    .optional(),
});

export const marketplaceDraftSchema = z
  .object({
    orgId: z.uuid(),
    requestId: z.uuid(),
    agent: z
      .object({
        ...agentProfileExtensionsSchema.shape,
        name: z.string().trim().min(1).max(200),
        role: z.string().trim().min(1).max(100),
        persona: z.string().trim().min(1).max(30000),
        avatar: z
          .string()
          .max(2000)
          .refine((value) => /^\/avatars\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes('..'))
          .optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        priority: z.number().int().min(1).max(10),
        allowedActions: z.array(z.string().refine((value) => actions.has(value))).max(actions.size),
        voiceConfig: z
          .object({
            providerId: z
              .string()
              .min(1)
              .max(100)
              .refine(
                (id) => Object.hasOwn(TTS_PROVIDERS, id) || /^custom-tts-[a-zA-Z0-9_-]+$/.test(id),
              )
              .transform((id) => id as TTSProviderId),
            modelId: z.string().min(1).max(200).optional(),
            voiceId: z.string().min(1).max(300),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();
