import { ClassroomCastingError, normalizeClassroomCasting } from '@/lib/agents/classroom-casting';
import { isSilentSpeech, summarizeSpeechAudio } from '@/lib/audio/speech-audio-report';
import { createLogger } from '@/lib/logger';
import { generateTTSForClassroom } from '@/lib/server/classroom-media-generation';
import { persistClassroom, readClassroom } from '@/lib/server/classroom-storage';
import { mergeRegeneratedSpeech } from '@/lib/audio/merge-regenerated-speech';
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

function normalizeCastingOrThrow(
  stage: Parameters<typeof normalizeClassroomCasting>[0],
  scenes: Parameters<typeof normalizeClassroomCasting>[1],
) {
  let casting;
  try {
    casting = normalizeClassroomCasting(stage, scenes);
  } catch (error) {
    throw new VoiceCompletionError(
      'INVALID_CASTING',
      error instanceof ClassroomCastingError ? error.message : 'Le casting vocal est invalide.',
    );
  }
  if (!casting) {
    throw new VoiceCompletionError('NO_CASTING', 'Cette classroom ne possède aucun casting vocal.');
  }
  return casting;
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
  /** Called after every line, so a background job can report its progress. */
  onProgress?: (
    progress: Pick<VoiceCompletionReport, 'requested' | 'generated' | 'failed'>,
  ) => void;
}): Promise<VoiceCompletionReport> {
  const classroom = await readClassroom(input.classroomId);
  if (!classroom) throw new VoiceCompletionError('NOT_FOUND', 'Classroom introuvable');

  const casting = normalizeCastingOrThrow(classroom.stage, classroom.scenes);

  const report: VoiceCompletionReport = {
    requested: 0,
    generated: 0,
    failed: [],
    updatedScenes: [],
  };
  if (input.sceneId && !casting.scenes.some((scene) => scene.id === input.sceneId)) {
    throw new VoiceCompletionError('NOT_FOUND', 'Scène introuvable');
  }
  /** Voix produites, par scène : ligne d'origine, texte synthétisé et morceaux obtenus. */
  const voiced = new Map<string, Array<{ id: string; text: string; produced: Action[] }>>();
  for (const scene of casting.scenes) {
    if (input.sceneId && scene.id !== input.sceneId) continue;
    for (const action of scene.actions ?? []) {
      if (!isSilentSpeech(action) || action.type !== 'speech') continue;
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
        const lines = voiced.get(scene.id) ?? [];
        lines.push({ id: action.id, text: action.text, produced });
        voiced.set(scene.id, lines);
        report.generated += 1;
      } else {
        report.failed.push({ sceneId: scene.id, actionId: action.id });
      }
      input.onProgress?.({
        requested: report.requested,
        generated: report.generated,
        failed: [...report.failed],
      });
    }
  }

  let scenes: Scene[] = casting.scenes;
  if (report.generated > 0) {
    await input.assertAccess();
    // La complétion dure des minutes : l'éditeur a pu enregistrer d'autres modifications entre-temps.
    // On relit la formation et on n'y insère que les voix dont le texte enregistré n'a pas changé ;
    // une ligne réécrite pendant la synthèse reste muette et le rapport le dit.
    const fresh = await readClassroom(input.classroomId);
    if (!fresh) throw new VoiceCompletionError('NOT_FOUND', 'Classroom introuvable');
    const freshCasting = normalizeCastingOrThrow(fresh.stage, fresh.scenes);
    scenes = freshCasting.scenes.map((scene) => {
      const lines = voiced.get(scene.id);
      if (!lines) return scene;
      let actions = scene.actions ?? [];
      let applied = 0;
      for (const line of lines) {
        const merged = mergeRegeneratedSpeech(actions, line.produced, line.id, line.text);
        if (merged) {
          actions = merged;
          applied += 1;
        } else {
          report.generated -= 1;
          report.failed.push({ sceneId: scene.id, actionId: line.id });
        }
      }
      if (applied === 0) return scene;
      report.updatedScenes.push({ id: scene.id, actions });
      return { ...scene, actions };
    });
    for (const [sceneId, lines] of voiced) {
      // Scène supprimée pendant la synthèse : ses voix ne s'appliquent plus à rien.
      if (freshCasting.scenes.some((scene) => scene.id === sceneId)) continue;
      report.generated -= lines.length;
      report.failed.push(...lines.map((line) => ({ sceneId, actionId: line.id })));
    }
    if (report.updatedScenes.length > 0) {
      await persistClassroom(
        {
          id: input.classroomId,
          stage: freshCasting.stage,
          scenes,
          ownerId: input.ownerId,
          orgId: input.orgId,
        },
        input.baseUrl,
      );
    }
  }
  log.info(
    `Voice completion ${input.classroomId}: ${report.generated}/${report.requested} generated, ` +
      `${summarizeSpeechAudio(scenes).missing} still silent`,
  );
  return report;
}
