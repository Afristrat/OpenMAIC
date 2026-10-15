import { isIP } from 'node:net';

/**
 * Développe une adresse IPv6 (forme abrégée « :: », zone `%eth0`, queue IPv4 pointée) en
 * 8 groupes de 16 bits. Retourne null si l'adresse n'est pas analysable.
 */
function expandIPv6(value: string): number[] | null {
  let address = value.toLowerCase();
  const zone = address.indexOf('%');
  if (zone >= 0) address = address.slice(0, zone);
  if (!address.includes(':')) return null;

  const lastColon = address.lastIndexOf(':');
  const tail = address.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (isIP(tail) !== 4) return null;
    const [a, b, c, d] = tail.split('.').map(Number);
    address = `${address.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const sides = address.split('::');
  if (sides.length > 2) return null;

  let groups: string[];
  if (sides.length === 2) {
    const left = sides[0] ? sides[0].split(':') : [];
    const right = sides[1] ? sides[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    groups = [...left, ...Array<string>(missing).fill('0'), ...right];
  } else {
    groups = address.split(':');
  }

  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

/**
 * Clé de seau de limitation de débit pour une adresse cliente. Un abonné IPv6 reçoit au moins
 * un /64 : sans regroupement, un seul client changerait d'adresse à chaque requête pour
 * obtenir un seau neuf. L'IPv4 (y compris mappée en IPv6) reste adressée individuellement.
 * Une valeur non analysable est rendue telle quelle.
 */
export function rateLimitBucketForIp(ip: string): string {
  if (isIP(ip) === 4) return ip;
  const groups = expandIPv6(ip);
  if (!groups) return ip;

  // ::ffff:a.b.c.d (IPv4 mappée) : on juge l'IPv4 embarquée.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
  }

  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`;
}

/**
 * Trusted client address. The edge (infra/coolify/qalem-edge.nginx.conf) overwrites
 * X-Real-IP with the address it resolved itself, so that header is the only value a
 * client cannot choose. Without it (edge bypassed), the LAST X-Forwarded-For element
 * is the one appended by the nearest proxy; the first one is client-supplied.
 * Anything that is not a valid IP collapses into one shared bucket, never a new one.
 */
export function trustedClientIp(headers: Headers): string {
  const realIp = headers.get('x-real-ip')?.trim();
  const forwardedLast = headers.get('x-forwarded-for')?.split(',').pop()?.trim();
  const candidate = realIp || forwardedLast;
  return candidate && isIP(candidate) !== 0 ? candidate : '0.0.0.0';
}
