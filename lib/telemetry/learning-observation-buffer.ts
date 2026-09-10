import type { PedagogySession } from './learning-observation-schema';
import { DiscussionObservationBuffer, type DiscussionSignal } from './discussion-observation';
import type { SceneType } from '@/lib/types/stage';

/** Foreground scene dwell time, not a claim that audio was heard or learning occurred. */
export class LearningObservationBuffer {
  private visits: Array<{ id: string; type: SceneType; milliseconds: number }> = [];
  private completed = new Set<string>();
  private scores = new Map<string, number>();
  private attempts = new Map<string, number[]>();
  private discussionMessages = new Map<string, { sceneId: string; accepted: boolean }>();
  private discussions = new Map<string, { sceneId: string; buffer: DiscussionObservationBuffer }>();
  private actions = { play: 0, pause: 0, seek: 0 };
  private lastTime: number;
  private visible = true;
  private currentId: string | null = null;

  constructor(
    readonly stageId: string,
    readonly consentEpoch: string,
    readonly sessionId: string,
    private readonly now: () => number = () => performance.now(),
    readonly orgId?: string,
  ) {
    this.lastTime = now();
  }

  private checkpoint(): void {
    const now = this.now();
    const last = this.visits.at(-1);
    if (this.visible && this.currentId && last?.id === this.currentId) {
      const remaining = Math.max(
        0,
        86400000 - this.visits.reduce((sum, visit) => sum + visit.milliseconds, 0),
      );
      last.milliseconds += Math.min(remaining, Math.max(0, now - this.lastTime));
    }
    this.lastTime = now;
  }

  scene(id: string | null, type?: SceneType): void {
    this.checkpoint();
    if (id === this.currentId) return;
    this.currentId = id;
    if (id && type && this.visits.length < 256) this.visits.push({ id, type, milliseconds: 0 });
  }

  visibility(visible: boolean): void {
    this.checkpoint();
    this.visible = visible;
  }
  action(type: 'play' | 'pause' | 'seek'): void {
    this.actions[type] = Math.min(10000, this.actions[type] + 1);
  }
  complete(sceneId: string): void {
    if (this.visits.some((visit) => visit.id === sceneId)) this.completed.add(sceneId);
  }
  quiz(sceneId: string, score: number): void {
    if (
      Number.isFinite(score) &&
      score >= 0 &&
      score <= 1 &&
      this.visits.some((visit) => visit.id === sceneId && visit.type === 'quiz')
    ) {
      if ([...this.attempts.values()].reduce((sum, values) => sum + values.length, 0) >= 512)
        throw new Error('Quiz observation capacity exceeded');
      const attempts = this.attempts.get(sceneId) ?? [];
      attempts.push(score);
      this.attempts.set(sceneId, attempts);
      this.scores.set(sceneId, score);
      this.complete(sceneId);
    }
  }

  snapshot(sceneIds: readonly string[], agentCount: number): PedagogySession | null {
    this.checkpoint();
    if (!this.visits.length) return null;
    const durations = this.visits.map((visit) => Math.floor(visit.milliseconds / 1000));
    const actualIds = new Set(sceneIds);
    const completedCount = [...this.completed].filter((id) => actualIds.has(id)).length;
    // One end-of-session summary per scene, not a fabricated attempt-by-attempt log.
    const scenes = new Map<string, NonNullable<PedagogySession['sceneObservations']>[number]>();
    this.visits.forEach((visit, index) => {
      const previous = scenes.get(visit.id);
      scenes.set(visit.id, {
        id: visit.id,
        type: visit.type,
        seconds: (previous?.seconds ?? 0) + durations[index],
        completed: this.completed.has(visit.id),
        score: visit.type === 'quiz' ? (this.scores.get(visit.id) ?? null) : null,
        discussionMessages: [...this.discussionMessages.values()].filter(
          (message) => message.sceneId === visit.id && message.accepted,
        ).length,
        ...(visit.type === 'quiz' ? { attempts: [...(this.attempts.get(visit.id) ?? [])] } : {}),
      });
    });
    const discussions = [...this.discussions.values()].flatMap(({ buffer }) => {
      buffer.end();
      const observation = buffer.snapshot();
      return observation ? [observation] : [];
    });
    return {
      sessionId: this.sessionId,
      consentEpoch: this.consentEpoch,
      ...(this.orgId ? { orgId: this.orgId } : {}),
      stageId: this.stageId,
      sceneSequence: this.visits.map((visit) => visit.type),
      sceneDurations: durations,
      quizScores: [...this.scores.values()],
      sceneObservations: [...scenes.values()],
      ...(discussions.length ? { discussions } : {}),
      completionRate: actualIds.size ? completedCount / actualIds.size : 0,
      totalDuration: Math.min(
        86400,
        durations.reduce((sum, duration) => sum + duration, 0),
      ),
      subjectTags: [],
      language: null,
      level: null,
      agentCount: Math.min(32, Math.max(0, agentCount)),
      actionCounts: { ...this.actions },
    };
  }

  discussion(sceneId: string, messageId: string, phase: 'submitted' | 'accepted'): void {
    if (!this.visits.some((visit) => visit.id === sceneId)) return;
    const previous = this.discussionMessages.get(messageId);
    if (phase === 'submitted' && !previous) {
      if (this.discussionMessages.size >= 512)
        throw new Error('Discussion observation capacity exceeded');
      this.discussionMessages.set(messageId, { sceneId, accepted: false });
    } else if (phase === 'accepted' && previous?.sceneId === sceneId) {
      previous.accepted = true;
    }
  }

  discussionTurn(signal: DiscussionSignal): void {
    if (signal.stageId !== this.stageId || signal.orgId !== this.orgId) return;
    if (signal.phase === 'begin' && !this.discussions.has(signal.discussionId)) {
      if (
        this.currentId !== signal.sceneId ||
        !this.visits.some((visit) => visit.id === signal.sceneId)
      )
        return;
      if (this.discussions.size >= 32) throw new Error('Discussion observation capacity exceeded');
      this.discussions.set(signal.discussionId, {
        sceneId: signal.sceneId,
        buffer: new DiscussionObservationBuffer(signal.discussionId, signal.sceneId, this.now),
      });
    }
    const entry = this.discussions.get(signal.discussionId);
    if (!entry || entry.sceneId !== signal.sceneId) return;
    // No begin in this consent epoch means no joining a pre-consent conversation.
    switch (signal.phase) {
      case 'start':
        entry.buffer.startTurn(signal.messageId, signal.agentId);
        break;
      case 'segment':
        entry.buffer.segment(signal.messageId, signal.interventionType);
        break;
      case 'turn-end':
        entry.buffer.finishObservedTurn(signal.messageId, 'completed');
        break;
      case 'end':
        entry.buffer.end();
        break;
    }
  }
}
