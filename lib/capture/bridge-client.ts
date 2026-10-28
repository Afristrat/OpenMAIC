/**
 * Côté page : détecter l'extension de capture et lui transmettre un code d'appairage.
 *
 * Ne bloque jamais la page : une extension absente donne l'état « absente » après un court délai,
 * jamais une erreur. Seuls comptent les messages venant de la page elle-même (`event.source` est la
 * fenêtre, `event.origin` son origine) : une iframe ou une autre fenêtre ne peut pas répondre.
 */

import {
  BRIDGE_CHANNEL,
  BRIDGE_VERSION,
  MIN_EXTENSION_VERSION,
  compareVersions,
  parseBridgeMessage,
  type BridgeMessage,
  type BridgeMessageType,
} from '@/lib/capture/bridge-protocol';

export type ExtensionStatus =
  | { state: 'present'; version: string; paired: boolean }
  | { state: 'outdated'; version: string; paired: boolean }
  | { state: 'absent' };

export type PairResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'network' | 'rejected' | 'absent' };

/** Surface minimale de `window` utilisée ici, remplaçable dans les tests. */
export type BridgeTarget = {
  postMessage(message: unknown, targetOrigin: string): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  location: { origin: string };
};

const DETECT_TIMEOUT_MS = 600;
const DETECT_RETRIES = 1;
const PAIR_TIMEOUT_MS = 10_000;

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function request(
  target: BridgeTarget,
  type: 'ping' | 'pair',
  payload: Record<string, unknown>,
  expected: BridgeMessageType,
  timeoutMs: number,
): Promise<BridgeMessage | null> {
  return new Promise((resolve) => {
    const id = newId();
    const finish = (value: BridgeMessage | null) => {
      clearTimeout(timer);
      target.removeEventListener('message', onMessage);
      resolve(value);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== target || event.origin !== target.location.origin) return;
      const message = parseBridgeMessage(event.data);
      if (message && message.id === id && message.type === expected) finish(message);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    target.addEventListener('message', onMessage);
    target.postMessage(
      { channel: BRIDGE_CHANNEL, v: BRIDGE_VERSION, id, type, payload },
      target.location.origin,
    );
  });
}

export async function detectExtension(
  target: BridgeTarget = window,
  options: { timeoutMs?: number; retries?: number } = {},
): Promise<ExtensionStatus> {
  const timeoutMs = options.timeoutMs ?? DETECT_TIMEOUT_MS;
  const attempts = (options.retries ?? DETECT_RETRIES) + 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const reply = await request(target, 'ping', {}, 'pong', timeoutMs);
    if (reply && reply.type === 'pong') {
      const { version, paired } = reply.payload;
      return compareVersions(version, MIN_EXTENSION_VERSION) < 0
        ? { state: 'outdated', version, paired }
        : { state: 'present', version, paired };
    }
  }
  return { state: 'absent' };
}

export async function pairExtension(
  code: string,
  target: BridgeTarget = window,
  timeoutMs: number = PAIR_TIMEOUT_MS,
): Promise<PairResult> {
  const reply = await request(target, 'pair', { code }, 'paired', timeoutMs);
  if (!reply || reply.type !== 'paired') return { ok: false, reason: 'absent' };
  return reply.payload.ok
    ? { ok: true }
    : { ok: false, reason: reply.payload.reason ?? 'rejected' };
}
