import type { PedagogySession } from './pedagogy-collector';
import type { SceneType } from '@/lib/types/stage';

/** Foreground scene dwell time, not a claim that audio was heard or learning occurred. */
export class LearningObservationBuffer {
  private visits: Array<{ id: string; type: SceneType; milliseconds: number }> = [];
  private completed = new Set<string>();
  private scores = new Map<string, number>();
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
      this.visits.some((visit) => visit.id === sceneId)
    ) {
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
    return {
      sessionId: this.sessionId,
      consentEpoch: this.consentEpoch,
      ...(this.orgId ? { orgId: this.orgId } : {}),
      stageId: this.stageId,
      sceneSequence: this.visits.map((visit) => visit.type),
      sceneDurations: durations,
      quizScores: [...this.scores.values()],
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
}
