import { z } from 'zod';
import { learningSessionSchema, type PedagogySession } from './learning-observation-schema';

const PREFIX = 'qalem-learning-outbox:v1:';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const entrySchema = z
  .object({ createdAt: z.number().int().nonnegative(), observation: learningSessionSchema })
  .strict();

/** One storage key per immutable session: concurrent tabs cannot overwrite each other's queue. */
export class LearningObservationOutbox {
  private readonly prefix: string;
  constructor(
    userId: string,
    private readonly storage: Storage,
    private readonly now = Date.now,
  ) {
    this.prefix = `${PREFIX}${z.string().uuid().parse(userId)}:`;
  }
  private keys(): string[] {
    return Array.from({ length: this.storage.length }, (_, index) =>
      this.storage.key(index),
    ).filter((key): key is string => key !== null && key.startsWith(this.prefix));
  }
  read(): PedagogySession[] {
    const entries: z.infer<typeof entrySchema>[] = [];
    for (const key of this.keys()) {
      const raw = this.storage.getItem(key);
      let entry: z.infer<typeof entrySchema> | null = null;
      try {
        if (raw && raw.length <= 32768) entry = entrySchema.parse(JSON.parse(raw));
      } catch {
        /* Invalid local storage is never sent to the server. */
      }
      if (
        !entry ||
        key !== this.prefix + entry.observation.sessionId ||
        entry.createdAt > this.now() + 60000 ||
        this.now() - entry.createdAt >= MAX_AGE
      ) {
        this.storage.removeItem(key);
      } else entries.push(entry);
    }
    return entries.sort((a, b) => a.createdAt - b.createdAt).map((entry) => entry.observation);
  }
  put(observation: PedagogySession): void {
    const parsed = learningSessionSchema.parse(observation);
    const entries = this.read();
    const existing = entries.find((item) => item.sessionId === parsed.sessionId);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(parsed))
        throw new Error('Observation is immutable');
      return;
    }
    // ponytail: at most 128 pending sessions/account; use IndexedDB if actual offline usage needs more.
    if (entries.length >= 128) throw new Error('Observation outbox full');
    const serialized = JSON.stringify({ createdAt: this.now(), observation: parsed });
    if (new TextEncoder().encode(serialized).byteLength > 32768)
      throw new Error('Observation too large');
    this.storage.setItem(this.prefix + parsed.sessionId, serialized);
  }
  remove(sessionId: string): void {
    this.storage.removeItem(this.prefix + sessionId);
  }
  clear(): void {
    for (const key of this.keys()) this.storage.removeItem(key);
  }
}
