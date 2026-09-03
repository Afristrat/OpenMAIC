import { z } from 'zod';

const stageId = z.string().trim().min(1).max(160);

const createLiveSessionSchema = z.object({
  stageId,
  recorded: z.literal(true),
});

const liveSessionEventSchema = z.object({
  tsMs: z.number().int().nonnegative(),
  actor: z.enum(['agent', 'user', 'system']),
  eventType: z.string().trim().min(1).max(80),
  payload: z.record(z.string(), z.unknown()),
  audioPath: z.string().trim().min(1).max(1024).nullable().default(null),
  audioBytes: z.number().int().nonnegative().default(0),
});

const replayPositionSchema = z.object({
  positionMs: z.number().int().nonnegative(),
});

export type CreateLiveSessionInput = z.infer<typeof createLiveSessionSchema>;
export type LiveSessionEventInput = z.infer<typeof liveSessionEventSchema>;

export function parseCreateLiveSession(input: unknown): CreateLiveSessionInput {
  const parsed = createLiveSessionSchema.safeParse(input);
  if (!parsed.success) {
    if ((input as { recorded?: unknown } | null)?.recorded !== true) {
      throw new Error('Explicit recording consent is required');
    }
    throw parsed.error;
  }
  return parsed.data;
}

export function parseLiveSessionEvent(input: unknown): LiveSessionEventInput {
  return liveSessionEventSchema.parse(input);
}

export function parseReplayPosition(input: unknown): { positionMs: number } {
  return replayPositionSchema.parse(input);
}
