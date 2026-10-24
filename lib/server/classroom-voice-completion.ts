import { ClassroomCastingError, normalizeClassroomCasting } from '@/lib/agents/classroom-casting';
import { isSilentSpeech, summarizeSpeechAudio } from '@/lib/audio/speech-audio-report';
import { createLogger } from '@/lib/logger';
import { generateTTSForClassroom } from '@/lib/server/classroom-media-generation';
import { persistClassroom, readClassroom } from '@/lib/server/classroom-storage';
import type { Action } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';

const log = createLogger('ClassroomVoiceCompletion');

export interface VoiceCompletionFailure {
  sceneId: string;
  actionId: string;
}

export interface VoiceCompletionReport {
  /** Speech lines that had no audio when the completion started. */
  requested: number;
  /** Lines that now carry an audio file. */
  generated: number;
  /** Lines still silent after the attempt: the caller must say so, never hide them. */
  failed: VoiceCompletionFailure[];
  /** Actions of every scene that received audio, so a client can refresh without a reload. */
  updatedScenes: Array<{ id: string; actions: Action[] }>;
  /** Vrai quand le solde de crédits est épuisé : les lignes restantes n'ont pas été tentées. */
  creditsBlocked?: boolean;
}

export class VoiceCompletionError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'NO_CASTING' | 'INVALID_CASTING',
    message: string,
  ) {
    super(message);
    this.name = 'VoiceCompletionError';
  }
}

/**
 * Generates only the voices a persisted course is missing, one line at a time so that a failing
 * line never costs the others, and persists what succeeded. Lines that stay silent are reported.
 */
export async function completeMissingSpeechAudio(input: {
  classroomId: string;
  ownerId: string;
  orgId: string;
  baseUrl: string;
  assertAccess: () => Promise<void>;
  /** Limits the completion to one scene: a long course is completed scene by scene. */
  sceneId?: string;
}): Promise<VoiceCompletionReport> {
  const classroom = await readClassroom(input.classroomId);
  if (!classroom) throw new VoiceCompletionError('NOT_FOUND', 'Classroom introuvable');

  let casting;
  try {
    casting = normalizeClassroomCasting(classroom.stage, classroom.scenes);
  } catch (error) {
    throw new VoiceCompletionError(
      'INVALID_CASTING',
      error instanceof ClassroomCastingError ? error.message : 'Le casting vocal est invalide.',
    );
  }
  if (!casting) {
    throw new VoiceCompletionError('NO_CASTING', 'Cette classroom ne possède aucun casting vocal.');
  }

  const report: VoiceCompletionReport = {
    requested: 0,
    generated: 0,
    failed: [],
    updatedScenes: [],
  };
  const scenes: Scene[] = [];
  if (input.sceneId && !casting.scenes.some((scene) => scene.id === input.sceneId)) {
    throw new VoiceCompletionError('NOT_FOUND', 'Scène introuvable');
  }
  for (const scene of casting.scenes) {
    const actions: Action[] = [];
    const generatedBefore = report.generated;
    const selected = !input.sceneId || scene.id === input.sceneId;
    for (const action of scene.actions ?? []) {
      if (!selected || !isSilentSpeech(action)) {
        actions.push(action);
        continue;
      }
      report.requested += 1;
      // The generator splits long lines and writes the audio on the scene it receives.
      const single: Scene = { ...scene, actions: [{ ...action }] };
      // Un solde épuisé refuserait chaque ligne suivante : on ne les tente plus.
      if (!report.creditsBlocked) {
        try {
          const generation = await generateTTSForClassroom(
            [single],
            input.classroomId,
            input.assertAccess,
            casting.teacherProfile,
            casting.agents,
            undefined,
            casting.stage.languageDirective,
          );
          if (generation.creditsBlocked) report.creditsBlocked = true;
        } catch (error) {
          log.warn(`Voice generation failed for ${action.id}`, error);
        }
      }
      const produced = single.actions ?? [];
      if (produced.length > 0 && !produced.some(isSilentSpeech)) {
        actions.push(...produced);
        report.generated += 1;
      } else {
        actions.push(action);
        report.failed.push({ sceneId: scene.id, actionId: action.id });
      }
    }
    scenes.push({ ...scene, actions });
    if (report.generated > generatedBefore) report.updatedScenes.push({ id: scene.id, actions });
  }

  if (report.generated > 0) {
    await input.assertAccess();
    await persistClassroom(
      {
        id: input.classroomId,
        stage: casting.stage,
        scenes,
        ownerId: input.ownerId,
        orgId: input.orgId,
      },
      input.baseUrl,
    );
  }
  log.info(
    `Voice completion ${input.classroomId}: ${report.generated}/${report.requested} generated, ` +
      `${summarizeSpeechAudio(scenes).missing} still silent`,
  );
  return report;
}
