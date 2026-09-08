import { createHash } from 'node:crypto';

/** The random state supplies entropy; the persisted, single-use nonce authenticates this context. */
export function loginContextNonce(state: string, clientId: string, targetLinkUri: string): string {
  // Preserve the exact target string: LTI 1.3 §5.3.4 requires the same value, not URL equivalence.
  return createHash('sha256')
    .update(JSON.stringify([state, clientId, targetLinkUri]))
    .digest('hex');
}
