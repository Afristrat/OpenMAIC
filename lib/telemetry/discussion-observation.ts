import { z } from 'zod';

const identifier = z.string().trim().min(1).max(256);
export const interventionTypeSchema = z.enum([
  'question',
  'answer',
  'counter_argument',
  'synthesis',
  'joke',
  'example',
  'unknown',
]);

/** Heuristic only. An agent's persona is not evidence that a message is a joke. */
export function classifyIntervention(
  message: string,
  _agentRole?: string,
): z.infer<typeof interventionTypeSchema> {
  if (!message.trim()) return 'unknown';
  if (
    /en résumé|pour résumer|en conclusion|to summarize|in summary|to conclude|خلاصة|باختصار|\brecap\b|\bto sum up\b/i.test(
      message,
    )
  )
    return 'synthesis';
  if (
    /\bmais\b|\bcependant\b|\bhowever\b|\btoutefois\b|\bnéanmoins\b|\ben revanche\b|لكن|ومع ذلك|\bon the other hand\b/i.test(
      message,
    )
  )
    return 'counter_argument';
  if (/[?؟]/.test(message)) return 'question';
  if (
    /par exemple|for example|for instance|مثل[اً]|على سبيل المثال|e\.g\.|such as\b|consider the case|prenons le cas|imaginons que/i.test(
      message,
    )
  )
    return 'example';
  return 'answer';
}

const turnSchema = z
  .object({
    id: identifier,
    agentId: identifier,
    interventionType: interventionTypeSchema,
    durationMs: z.number().int().min(0).max(86400000),
    outcome: z.enum(['completed', 'interrupted', 'failed']),
  })
  .strict();

export const discussionObservationSchema = z
  .object({
    discussionId: z.string().uuid(),
    sceneId: identifier,
    durationBasis: z.literal('client-monotonic-elapsed'),
    classificationMethod: z.literal('text-heuristic-v1'),
    turns: z.array(turnSchema).min(1).max(256),
    postDiscussionQuiz: z
      .object({ sceneId: identifier, score: z.number().min(0).max(1) })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((value) => new Set(value.turns.map((turn) => turn.id)).size === value.turns.length);

export type DiscussionObservation = z.infer<typeof discussionObservationSchema>;

const signalScope = z.object({
  stageId: identifier,
  sceneId: identifier,
  orgId: z.string().uuid(),
  discussionId: z.string().uuid(),
});
export const discussionSignalSchema = z.discriminatedUnion('phase', [
  signalScope.extend({ phase: z.literal('begin') }).strict(),
  signalScope
    .extend({ phase: z.literal('start'), messageId: identifier, agentId: identifier })
    .strict(),
  signalScope
    .extend({
      phase: z.literal('segment'),
      messageId: identifier,
      interventionType: interventionTypeSchema,
    })
    .strict(),
  signalScope.extend({ phase: z.literal('turn-end'), messageId: identifier }).strict(),
  signalScope.extend({ phase: z.literal('end') }).strict(),
]);
export type DiscussionSignal = z.infer<typeof discussionSignalSchema>;
export type DiscussionScope = z.infer<typeof signalScope>;

/** Structured local signals only: no text or learner identity is dispatched. */
export function publishDiscussionSignal(signal: DiscussionSignal): void {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('qalem-discussion-turn', { detail: signal }));
}

/** Instantiate only after opt-in; discard the whole instance when its consent epoch changes.
 * This bounded local recorder makes no network calls and retains no message text.
 */
export class DiscussionObservationBuffer {
  private turns: DiscussionObservation['turns'] = [];
  private active: {
    id: string;
    agentId: string;
    started: number;
    type: DiscussionObservation['turns'][number]['interventionType'];
  } | null = null;
  private ended = false;
  private quiz: DiscussionObservation['postDiscussionQuiz'] = null;
  private lastTime = -Infinity;

  constructor(
    private readonly discussionId: string,
    private readonly sceneId: string,
    private readonly now: () => number = () => performance.now(),
  ) {
    z.string().uuid().parse(discussionId);
    identifier.parse(sceneId);
  }

  private time(): number {
    const value = this.now();
    if (!Number.isFinite(value) || value < this.lastTime)
      throw new Error('Invalid discussion clock');
    this.lastTime = value;
    return value;
  }

  startTurn(id: string, agentId: string): boolean {
    identifier.parse(id);
    identifier.parse(agentId);
    if (this.ended || this.turns.some((turn) => turn.id === id) || this.active?.id === id)
      return false;
    if (this.active) throw new Error('Previous discussion turn is unfinished');
    if (this.turns.length >= 256) throw new Error('Discussion observation capacity exceeded');
    this.active = { id, agentId, started: this.time(), type: 'unknown' };
    return true;
  }

  finishTurn(id: string, text: string, outcome: 'completed' | 'interrupted' | 'failed'): boolean {
    this.segment(id, classifyIntervention(text));
    return this.finishObservedTurn(id, outcome);
  }

  segment(id: string, type: DiscussionObservation['turns'][number]['interventionType']): void {
    if (!this.active || this.active.id !== id || this.ended) return;
    // Same precedence as the classifier, across fully revealed segments; no text retained.
    const priority = [
      'unknown',
      'answer',
      'joke',
      'example',
      'question',
      'counter_argument',
      'synthesis',
    ];
    interventionTypeSchema.parse(type);
    if (priority.indexOf(type) > priority.indexOf(this.active.type)) this.active.type = type;
  }

  finishObservedTurn(id: string, outcome: 'completed' | 'interrupted' | 'failed'): boolean {
    if (!this.active || this.active.id !== id || this.ended) return false;
    const turn = turnSchema.parse({
      id,
      agentId: this.active.agentId,
      interventionType: outcome === 'completed' ? this.active.type : 'unknown',
      durationMs: Math.floor(this.time() - this.active.started),
      outcome,
    });
    this.turns.push(turn);
    this.active = null;
    return true;
  }

  end(): void {
    if (this.ended) return;
    if (this.active) this.finishTurn(this.active.id, '', 'interrupted');
    this.time();
    this.ended = true;
  }

  /** Caller supplies only quiz results from this stage; first result after the end is retained. */
  recordQuiz(sceneId: string, score: number): boolean {
    if (!this.ended || !this.turns.length || this.quiz) return false;
    identifier.parse(sceneId);
    z.number().min(0).max(1).parse(score);
    this.time();
    this.quiz = { sceneId, score };
    return true;
  }

  snapshot(): DiscussionObservation | null {
    if (!this.ended || !this.turns.length) return null;
    // Parsing returns a detached copy, so a consumer cannot rewrite this buffer's evidence.
    return discussionObservationSchema.parse({
      discussionId: this.discussionId,
      sceneId: this.sceneId,
      durationBasis: 'client-monotonic-elapsed',
      classificationMethod: 'text-heuristic-v1',
      turns: this.turns,
      postDiscussionQuiz: this.quiz,
    });
  }
}
