/**
 * Plafonds d'appels d'IA par jeton de capture : une fenêtre glissante d'une minute, un compteur
 * pour la rédaction et un autre pour la narration et la voix off.
 *
 * ponytail: compteurs en mémoire du processus web (une seule instance aujourd'hui),
 * à remplacer par un compteur partagé si le web passe à plusieurs instances.
 */

const WINDOW_MS = 60_000;
export const DESCRIBE_LIMIT_PER_MINUTE = 30;
export const MEDIA_LIMIT_PER_MINUTE = 40;

function createQuota(limit: number) {
  const calls = new Map<string, number[]>();
  return {
    consume(tokenId: string, now = Date.now()): boolean {
      if (calls.size > 5000) {
        for (const [id, times] of calls)
          if (times.every((at) => now - at >= WINDOW_MS)) calls.delete(id);
      }
      const recent = (calls.get(tokenId) ?? []).filter((at) => now - at < WINDOW_MS);
      if (recent.length >= limit) {
        calls.set(tokenId, recent);
        return false;
      }
      recent.push(now);
      calls.set(tokenId, recent);
      return true;
    },
    reset(): void {
      calls.clear();
    },
  };
}

const describeQuota = createQuota(DESCRIBE_LIMIT_PER_MINUTE);
const mediaQuota = createQuota(MEDIA_LIMIT_PER_MINUTE);

export const consumeDescribeQuota = describeQuota.consume;
export const resetDescribeQuota = describeQuota.reset;
export const consumeMediaQuota = mediaQuota.consume;
export const resetMediaQuota = mediaQuota.reset;
