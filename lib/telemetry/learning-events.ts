/** Local structured event only. The observer discards it without verified opt-in. */
export function publishQuizObservation(stageId: string, sceneId: string, score: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('qalem-learning-quiz', { detail: { stageId, sceneId, score } }),
  );
}

export function publishConsentChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('qalem-consent-change'));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('qalem-consent');
    channel.postMessage('changed');
    channel.close();
  }
}
