import { z } from 'zod';

/** Shared trust boundary, without importing the server's service-role client. */
export const learningSessionSchema = z
  .object({
    sessionId: z.string().uuid(),
    consentEpoch: z.string().uuid(),
    stageId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    sceneSequence: z
      .array(z.enum(['slide', 'quiz', 'interactive', 'pbl', 'plugin']))
      .min(1)
      .max(256),
    sceneDurations: z.array(z.number().int().min(0).max(86400)).min(1).max(256),
    quizScores: z.array(z.number().min(0).max(1)).max(512),
    completionRate: z.number().min(0).max(1),
    totalDuration: z.number().int().min(0).max(86400),
    subjectTags: z.array(z.string().max(100)).max(20),
    language: z.enum(['fr-FR', 'ar-MA', 'en-US']).nullable(),
    level: z.enum(['beginner', 'intermediate', 'advanced']).nullable(),
    agentCount: z.number().int().min(0).max(32),
    actionCounts: z
      .object({
        play: z.number().int().min(0).max(10000),
        pause: z.number().int().min(0).max(10000),
        seek: z.number().int().min(0).max(10000),
      })
      .strict(),
  })
  .strict()
  .refine(
    (session) => session.sceneSequence.length === session.sceneDurations.length,
    'Scene measures must align',
  );

export type PedagogySession = z.infer<typeof learningSessionSchema>;
