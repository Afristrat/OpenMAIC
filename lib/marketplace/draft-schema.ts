import { z } from 'zod';
import { SLIDE_ACTIONS, WHITEBOARD_ACTIONS } from '@/lib/orchestration/registry/types';

const actions = new Set([...SLIDE_ACTIONS, ...WHITEBOARD_ACTIONS]);

export const marketplaceDraftSchema = z.object({
  orgId: z.uuid(),
  requestId: z.uuid(),
  agent: z.object({
    name: z.string().trim().min(1).max(200),
    role: z.string().trim().min(1).max(100),
    persona: z.string().trim().min(1).max(30000),
    avatar: z.string().max(2000).refine((value) =>
      /^\/avatars\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes('..'),
    ).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    priority: z.number().int().min(1).max(10),
    allowedActions: z.array(z.string().refine((value) => actions.has(value))).max(actions.size),
    voiceConfig: z.object({
      providerId: z.string().min(1).max(100),
      modelId: z.string().min(1).max(200).optional(),
      voiceId: z.string().min(1).max(300),
    }).strict().optional(),
  }).strict(),
}).strict();
