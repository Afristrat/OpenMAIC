/**
 * Limite d'essais du code d'accès partagé (ACCESS_CODE), par adresse cliente.
 *
 * 5 échecs en 60 s bloquent l'adresse pendant 15 min ; un succès remet le compteur à zéro.
 * Le magasin est borné : les clés dérivent d'une entrée contrôlée par le client (rotation
 * d'adresses IPv6), il ne doit pas grossir au gré de l'attaquant.
 *
 * ponytail: compteurs locaux au processus tant que Qalem tourne en un seul réplica web ;
 * passer sur Redis avant d'augmenter le nombre de réplicas (comme lib/rate-limit.ts).
 */

const MAX_FAILURES = 5;
const WINDOW_MS = 60_000;
const BLOCK_MS = 15 * 60_000;

/** Plafond de clés suivies ; au-delà, purge des entrées expirées puis éviction FIFO. */
export const ACCESS_CODE_THROTTLE_MAX_KEYS = 10_000;

type Entry = { failures: number[]; blockedUntil: number };

const store = new Map<string, Entry>();

function isExpired(entry: Entry, now: number): boolean {
  return entry.blockedUntil <= now && entry.failures.every((ts) => ts <= now - WINDOW_MS);
}

function makeRoomForNewKey(now: number): void {
  if (store.size < ACCESS_CODE_THROTTLE_MAX_KEYS) return;
  for (const [key, entry] of store) {
    if (isExpired(entry, now)) store.delete(key);
  }
  // Map itère dans l'ordre d'insertion : on retire les plus anciennes d'abord.
  for (const key of store.keys()) {
    if (store.size < ACCESS_CODE_THROTTLE_MAX_KEYS) return;
    store.delete(key);
  }
}

export function accessCodeThrottleStatus(
  key: string,
  now: number = Date.now(),
): { blocked: boolean; retryAfterSeconds: number } {
  const entry = store.get(key);
  if (!entry || entry.blockedUntil <= now) return { blocked: false, retryAfterSeconds: 0 };
  return { blocked: true, retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000) };
}

export function recordAccessCodeFailure(key: string, now: number = Date.now()): void {
  let entry = store.get(key);
  if (!entry) {
    makeRoomForNewKey(now);
    entry = { failures: [], blockedUntil: 0 };
    store.set(key, entry);
  }
  entry.failures = entry.failures.filter((ts) => ts > now - WINDOW_MS);
  entry.failures.push(now);
  if (entry.failures.length >= MAX_FAILURES) {
    entry.blockedUntil = now + BLOCK_MS;
    entry.failures = [];
  }
}

export function clearAccessCodeFailures(key: string): void {
  store.delete(key);
}

export function accessCodeThrottleSize(): number {
  return store.size;
}

/** Réservé aux tests. */
export function resetAccessCodeThrottle(): void {
  store.clear();
}
