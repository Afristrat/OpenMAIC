import { z } from 'zod';

/** Shared trust boundary, without importing the server's service-role client. */
export const learningSessionSchema = z
  .object({
    sessionId: z.string().uuid(),
    consentEpoch: z.string().uuid(),
    // Older durable entries keep their original source-only scope; never relabel them.
    orgId: z.string().uuid().optional(),
    stageId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    sceneSequence: z
      .array(z.enum(['slide', 'quiz', 'interactive', 'pbl', 'plugin']))
      .min(1)
      .max(256),
    sceneDurations: z.array(z.number().int().min(0).max(86400)).min(1).max(256),
    quizScores: z.array(z.number().min(0).max(1)).max(512),
    // Absent on old durable entries: never infer which scene an old score belonged to.
    sceneObservations: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
            type: z.enum(['slide', 'quiz', 'interactive', 'pbl', 'plugin']),
            seconds: z.number().int().min(0).max(86400),
            completed: z.boolean(),
            score: z.number().min(0).max(1).nullable(),
            attempts: z.array(z.number().min(0).max(1)).max(512).optional(),
          })
          .strict()
          .refine((item) => item.score === null || (item.type === 'quiz' && item.completed))
          .refine(
            (item) =>
              !item.attempts ||
              (item.type === 'quiz' &&
                (item.attempts.length === 0
                  ? item.score === null
                  : item.attempts.at(-1) === item.score)),
          ),
      )
      .min(1)
      .max(256)
      .optional(),
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
    (session) =>
      (session.sceneObservations?.reduce((sum, item) => sum + (item.attempts?.length ?? 0), 0) ??
        0) <= 512,
    'Too many quiz attempts',
  )
  .refine(
    (session) => session.sceneSequence.length === session.sceneDurations.length,
    'Scene measures must align',
  )
  .refine(
    (session) =>
      !session.sceneObservations ||
      (new Set(session.sceneObservations.map((item) => item.id)).size ===
        session.sceneObservations.length &&
        session.sceneObservations.reduce((sum, item) => sum + item.seconds, 0) ===
          session.totalDuration),
    'Scene observations must be unique and preserve total duration',
  );

export type PedagogySession = z.infer<typeof learningSessionSchema>;
