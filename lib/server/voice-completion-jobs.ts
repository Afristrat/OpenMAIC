import { randomUUID } from 'node:crypto';
import { VOICE_COMPLETION_FAILED_CODE } from '@/lib/audio/complete-missing-voices';
import { createLogger } from '@/lib/logger';
import type { Action } from '@/lib/types/action';
import type {
  VoiceCompletionFailure,
  VoiceCompletionReport,
} from '@/lib/server/classroom-voice-completion';

const log = createLogger('VoiceCompletionJobs');

/** Code d'une erreur de complétion connue du serveur (`VoiceCompletionError`), sinon le code générique. */
function voiceCompletionErrorCode(error: unknown): string {
  if (error instanceof Error && error.name === 'VoiceCompletionError') {
    const code = (error as Error & { code?: unknown }).code;
    if (typeof code === 'string' && code) return code;
  }
  return VOICE_COMPLETION_FAILED_CODE;
}

export type VoiceCompletionJobStatus = 'running' | 'succeeded' | 'failed';

export interface VoiceCompletionJob {
  id: string;
  classroomId: string;
  sceneId?: string;
  status: VoiceCompletionJobStatus;
  requested: number;
  generated: number;
  failed: VoiceCompletionFailure[];
  updatedScenes: Array<{ id: string; actions: Action[] }>;
  creditsBlocked: boolean;
  /** Message destiné à l'utilisateur quand le statut est `failed`. */
  error?: string;
  updatedAt: number;
}

export type VoiceCompletionProgress = Pick<
  VoiceCompletionReport,
  'requested' | 'generated' | 'failed'
>;

/** Une génération vocale dure des minutes : plus longtemps que la requête HTTP qui la lance. */
// ponytail: registre en mémoire, une seule instance web ; passer en table si le service est répliqué.
const JOBS = new Map<string, VoiceCompletionJob>();
const KEEP_FINISHED_MS = 60 * 60_000;

function forgetOldJobs(now: number): void {
  for (const [id, job] of JOBS) {
    if (job.status !== 'running' && now - job.updatedAt > KEEP_FINISHED_MS) JOBS.delete(id);
  }
}

export function readVoiceCompletionJob(id: string): VoiceCompletionJob | undefined {
  return JOBS.get(id);
}

/**
 * Lance la complétion en arrière-plan et rend aussitôt la tâche. Un second appel pour la même
 * salle et la même scène rend la tâche déjà en cours : un double clic ne double pas la dépense.
 */
export function startVoiceCompletionJob(
  target: { classroomId: string; sceneId?: string },
  run: (onProgress: (progress: VoiceCompletionProgress) => void) => Promise<VoiceCompletionReport>,
): VoiceCompletionJob {
  forgetOldJobs(Date.now());
  for (const job of JOBS.values()) {
    if (
      job.status === 'running' &&
      job.classroomId === target.classroomId &&
      job.sceneId === target.sceneId
    ) {
      return job;
    }
  }
  const job: VoiceCompletionJob = {
    id: randomUUID(),
    ...target,
    status: 'running',
    requested: 0,
    generated: 0,
    failed: [],
    updatedScenes: [],
    creditsBlocked: false,
    updatedAt: Date.now(),
  };
  JOBS.set(job.id, job);
  void run((progress) => {
    job.requested = progress.requested;
    job.generated = progress.generated;
    job.failed = progress.failed;
    job.updatedAt = Date.now();
  }).then(
    (report) => {
      job.requested = report.requested;
      job.generated = report.generated;
      job.failed = report.failed;
      job.updatedScenes = report.updatedScenes;
      job.creditsBlocked = report.creditsBlocked === true;
      // Rien n'a pu être généré faute de solde : un échec explicite, pas un « tout a échoué ».
      if (job.creditsBlocked && job.generated === 0) {
        job.status = 'failed';
        job.error = 'INSUFFICIENT_CREDITS';
      } else {
        job.status = 'succeeded';
      }
      job.updatedAt = Date.now();
    },
    (error: unknown) => {
      log.error(`Voice completion job ${job.id} failed for ${job.classroomId}`, error);
      job.status = 'failed';
      // Un code stable, traduit côté client : jamais un message en français vu par un apprenant arabophone.
      job.error = voiceCompletionErrorCode(error);
      job.updatedAt = Date.now();
    },
  );
  return job;
}
