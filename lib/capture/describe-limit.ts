/**
 * Plafond d'appels d'IA par jeton de capture : une fenêtre glissante d'une minute.
 *
 * ponytail: compteur en mémoire du processus web (une seule instance aujourd'hui),
 * à remplacer par un compteur partagé si le web passe à plusieurs instances.
 */

const WINDOW_MS = 60_000;
export const DESCRIBE_LIMIT_PER_MINUTE = 30;

const calls = new Map<string, number[]>();

export function consumeDescribeQuota(tokenId: string, now = Date.now()): boolean {
  if (calls.size > 5000) {
    for (const [id, times] of calls)
      if (times.every((at) => now - at >= WINDOW_MS)) calls.delete(id);
  }
  const recent = (calls.get(tokenId) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= DESCRIBE_LIMIT_PER_MINUTE) {
    calls.set(tokenId, recent);
    return false;
  }
  recent.push(now);
  calls.set(tokenId, recent);
  return true;
}

export function resetDescribeQuota(): void {
  calls.clear();
}
