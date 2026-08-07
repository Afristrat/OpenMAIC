type FrameScheduler = (callback: FrameRequestCallback) => number;

/** Wait for React's scene commit and one browser paint before starting audio. */
export function scheduleAfterVisualCommit(
  start: () => void,
  schedule: FrameScheduler = requestAnimationFrame,
): void {
  schedule(() => schedule(() => start()));
}
