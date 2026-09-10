type Scope = { orgId: string; stageId: string };
const drains = new Set<{ scope: Scope; drain: () => Promise<void> }>();

/** Registration lives only for the authenticated classroom observer's lifetime. */
export function registerLearningObservationDrain(scope: Scope, drain: () => Promise<void>) {
  const entry = { scope, drain };
  drains.add(entry);
  return () => {
    drains.delete(entry);
  };
}

/** Do not submit the native quiz ahead of its already queued discussion. No observer = no wait. */
export async function drainLearningObservations(scope: Scope, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const matching = [...drains].filter(
    (entry) => entry.scope.orgId === scope.orgId && entry.scope.stageId === scope.stageId,
  );
  if (!matching.length) return;
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Learning observations still pending'));
    }, 15000);
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    signal.addEventListener('abort', abort, { once: true });
    Promise.all(matching.map((entry) => Promise.resolve().then(entry.drain))).then(
      () => {
        cleanup();
        resolve();
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}
