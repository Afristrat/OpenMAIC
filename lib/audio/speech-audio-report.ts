import type { Action } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';

export interface SceneSpeechAudio {
  id: string;
  order: number;
  /** Speech lines that carry a text to be spoken. */
  speech: number;
  /** Speech lines with a text but no audio file: the MP4 and LMS exports refuse them. */
  missing: number;
}

export interface SpeechAudioReport {
  speech: number;
  missing: number;
  scenes: SceneSpeechAudio[];
}

type AudioScene = Pick<Scene, 'id' | 'order'> & { actions?: readonly Action[] };

/** A speech line is silent when it has a text to speak and no audio file attached. */
export function isSilentSpeech(action: Action): boolean {
  return action.type === 'speech' && Boolean(action.text?.trim()) && !action.audioUrl;
}

/** Speech lines and silent lines per scene: one definition shared by exports, player and audits. */
export function summarizeSpeechAudio(scenes: readonly AudioScene[]): SpeechAudioReport {
  const perScene = scenes.map((scene): SceneSpeechAudio => {
    const actions = scene.actions ?? [];
    return {
      id: scene.id,
      order: scene.order,
      speech: actions.filter((action) => action.type === 'speech' && action.text?.trim()).length,
      missing: actions.filter(isSilentSpeech).length,
    };
  });
  return {
    speech: perScene.reduce((total, scene) => total + scene.speech, 0),
    missing: perScene.reduce((total, scene) => total + scene.missing, 0),
    scenes: perScene,
  };
}

/**
 * The refusal of an export that needs a voice on every line. It names every scene concerned,
 * not only the first one, and says how to fix it.
 */
export function missingSpeechAudioMessage(
  report: SpeechAudioReport,
  format: 'MP4' | 'LMS',
): string {
  // The position in the course, not the stored order, which does not start at the same number everywhere.
  const where = report.scenes
    .flatMap((scene, index) => (scene.missing > 0 ? [`${index + 1} (${scene.missing})`] : []))
    .join(', ');
  return (
    `Export ${format} refusé : ${report.missing} prise(s) de parole sans voix, ` +
    `scène(s) ${where}. Générez les voix manquantes depuis le lecteur ` +
    `(« Générer les voix manquantes »), puis relancez l’export.`
  );
}
