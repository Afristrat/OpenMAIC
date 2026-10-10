/**
 * What a classroom generation does when an enabled media provider fails.
 *
 * `strict` (default) fails the whole classroom with an explicit error: nothing is delivered
 * silently incomplete. `degrade` keeps every generated scene, removes only the illustrations
 * that could not be produced and reports them as a visible warning on the job.
 * Set QALEM_MEDIA_FAILURE_MODE=degrade to opt in; unset it to return to strict.
 */
export function isMediaDegradeMode(): boolean {
  return process.env.QALEM_MEDIA_FAILURE_MODE?.trim().toLowerCase() === 'degrade';
}

export interface PartialMediaFailure {
  mediaMap: Record<string, string>;
  failures: ReadonlyArray<{ type: 'image' | 'video'; elementId: string; reason: string }>;
}

/** Duck-typed on purpose: it must keep working when the media module is mocked or reloaded. */
export function asPartialMediaFailure(error: unknown): PartialMediaFailure | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as Partial<PartialMediaFailure>;
  if (!candidate.mediaMap || typeof candidate.mediaMap !== 'object') return null;
  if (!Array.isArray(candidate.failures) || candidate.failures.length === 0) return null;
  return { mediaMap: candidate.mediaMap, failures: candidate.failures };
}

export function describeMediaWarning(failures: PartialMediaFailure['failures']): string {
  const images = failures.filter((failure) => failure.type === 'image').length;
  const videos = failures.filter((failure) => failure.type === 'video').length;
  const parts = [
    images > 0 ? `${images} image${images > 1 ? 's' : ''}` : '',
    videos > 0 ? `${videos} vidéo${videos > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
  const reasons = [...new Set(failures.map((failure) => failure.reason))].join(' ; ');
  return `Cours livré sans ${parts.join(' ni ')} : ${reasons}`;
}
