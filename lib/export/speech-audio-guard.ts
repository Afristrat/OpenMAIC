import { toast } from 'sonner';
import { summarizeSpeechAudio } from '@/lib/audio/speech-audio-report';
import type { Scene } from '@/lib/types/stage';

/**
 * Checks, before any export work starts, that every speech line has a voice. Otherwise it says
 * why the export cannot start and offers the fix in the same message, never a bare refusal.
 */
export function guardSpeechAudio(
  scenes: readonly Scene[],
  t: (key: string, options?: Record<string, unknown>) => string,
  toastId: string | number,
  complete: () => Promise<boolean>,
): boolean {
  const { missing } = summarizeSpeechAudio(scenes);
  if (missing === 0) return true;
  toast.error(t('export.missingVoices', { count: missing }), {
    id: toastId,
    duration: 15_000,
    action: { label: t('edit.tts.generateMissing'), onClick: () => void complete() },
  });
  return false;
}
