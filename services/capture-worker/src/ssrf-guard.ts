// Port of lib/server/ssrf-guard.ts (classification + validateUrlForSSRF) — capture-worker is a
// standalone npm project outside the pnpm workspace (see services/capture-worker/package.json),
// so it cannot import from the monorepo. Keep both in sync if the ranges or the policy change.
//
// Deliberately NOT ported: `safeFetch` / `createPinnedLookup` (undici dependency, pinned socket).
// The worker drives a Playwright browser, which resolves names itself and follows redirects and
// sub-resources on its own, so DNS pinning is not possible here. This check is therefore a
// one-shot validation of the submitted URL, with the same ranges as the main application.
import { promises as dns } from 'node:dns';
import { BlockList, isIP } from 'node:net';

export type ResolvedAddress = { address: string; family: number };

function normalizeAddress(value: string): string {
  let normalized = value.trim().toLowerCase();
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.replace(/\.+$/, '');
}

/** Strict dotted-decimal IPv4 (no leading zeros: "0177.0.0.1" is ambiguous and is not accepted). */
function parseIPv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) {
      return Number.NaN;
    }
    return Number.parseInt(part, 10);
  });

  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return octets;
}

/**
 * Legacy numeric host forms ("2130706433", "0x7f.1", "0177.0.0.1"): the WHATWG URL parser already
 * rewrites them to dotted decimal, but a direct caller may still hand us the raw string. Ambiguous
 * between decimal/octal/hex across stacks, so they are treated as private (fail closed).
 */
function isLegacyNumericHost(value: string): boolean {
  if (value.includes(':')) return false;
  const parts = value.split('.');
  if (parts.length > 4) return false;
  return parts.every((part) => /^(?:0x[0-9a-f]*|\d+)$/.test(part)) && !parseIPv4(value);
}

// IPv4 ranges that are never a legitimate public target (IANA special-purpose registry).
const blockedIPv4 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT, Tailscale
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast (deprecated)
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  blockedIPv4.addSubnet(address, prefix, 'ipv4');
}

/** Expand an IPv6 address (optionally with a dotted IPv4 tail or a zone id) into 8 hextets. */
function toHextets(ip: string): number[] | null {
  let normalized = normalizeAddress(ip);
  const zone = normalized.indexOf('%');
  if (zone >= 0) normalized = normalized.slice(0, zone);
  if (!normalized.includes(':')) return null;

  const lastColon = normalized.lastIndexOf(':');
  const tail = normalized.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    normalized = `${normalized.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }

  const sides = normalized.split('::');
  if (sides.length > 2) return null;

  let parts: string[];
  if (sides.length === 2) {
    const left = sides[0] ? sides[0].split(':') : [];
    const right = sides[1] ? sides[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    parts = [...left, ...Array<string>(missing).fill('0'), ...right];
  } else {
    parts = normalized.split(':');
  }

  if (parts.length !== 8) return null;
  if (parts.some((p) => !/^[0-9a-f]{1,4}$/.test(p))) return null;

  return parts.map((p) => Number.parseInt(p, 16));
}

function embeddedIPv4(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

export function isPrivateIP(ip: string): boolean {
  const normalized = normalizeAddress(ip);

  const ipv4 = parseIPv4(normalized);
  if (ipv4) {
    return blockedIPv4.check(ipv4.join('.'), 'ipv4');
  }
  if (isLegacyNumericHost(normalized)) {
    return true;
  }

  if (!normalized.includes(':')) {
    return false; // a hostname, not an IP literal
  }

  const h = toHextets(normalized);
  if (!h) {
    return true; // malformed IPv6 literal: fail closed
  }

  const upper80Zero = h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0;

  // ::ffff:a.b.c.d (IPv4-mapped) and ::ffff:0:a.b.c.d (SIIT): judged on the embedded IPv4
  if (upper80Zero && h[5] === 0xffff) return isPrivateIP(embeddedIPv4(h[6], h[7]));
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0xffff && h[5] === 0) {
    return isPrivateIP(embeddedIPv4(h[6], h[7]));
  }
  // ::/96 covers "::", "::1" and the deprecated IPv4-compatible form (::a.b.c.d)
  if (upper80Zero && h[5] === 0) return true;

  // NAT64: 64:ff9b::/96 (well-known) and 64:ff9b:1::/48 (local-use)
  if (h[0] === 0x0064 && h[1] === 0xff9b) {
    if (h[2] === 1) return true;
    if (h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) return true;
  }

  // 100::/64 discard-only
  if (h[0] === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return true;

  if (
    (h[0] & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (h[0] & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (h[0] & 0xffc0) === 0xfec0 || // fec0::/10 site-local (deprecated)
    (h[0] & 0xff00) === 0xff00 // ff00::/8 multicast
  ) {
    return true;
  }

  // 2001:db8::/32 documentation
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true;

  // 6to4 tunnel: 2002::/16 — embedded IPv4 sits in bits 16-47
  if (h[0] === 0x2002 && isPrivateIP(embeddedIPv4(h[1], h[2]))) return true;

  // Teredo tunnel: 2001:0000::/32 — client IPv4 in last 32 bits, XOR-inverted
  if (
    h[0] === 0x2001 &&
    h[1] === 0x0000 &&
    isPrivateIP(embeddedIPv4(h[6] ^ 0xffff, h[7] ^ 0xffff))
  ) {
    return true;
  }

  return false;
}

const LOCAL_NETWORK_BLOCK_MESSAGE =
  'Local/private network URLs are not allowed. If this is a self-hosted deployment or internal gateway (including split-horizon DNS), set ALLOW_LOCAL_NETWORKS=true to allow local network targets.';

type SsrfOptions = { allowLocalNetworks?: boolean };

/**
 * Seule exception à la garde : ALLOW_LOCAL_NETWORKS=true (ou 1), explicite, jamais déduite de
 * NODE_ENV. Les fournisseurs auto-hébergés déclarés côté serveur (env / server-providers.yml)
 * ne passent pas par la garde ; elle ne vise que les URL fournies par un utilisateur.
 */
function localNetworksAllowed(options: SsrfOptions): boolean {
  const allowLocal = process.env.ALLOW_LOCAL_NETWORKS;
  return options.allowLocalNetworks ?? (allowLocal === 'true' || allowLocal === '1');
}

type Inspection = { error: string } | { url: URL; addresses: ResolvedAddress[] | null };

/** Parse, apply the policy and resolve once. `addresses` is what the connection must be pinned to. */
async function inspectUrl(url: string, options: SsrfOptions): Promise<Inspection> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: 'Invalid URL' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { error: 'Only HTTP(S) URLs are allowed' };
  }

  if (localNetworksAllowed(options)) {
    return { url: parsed, addresses: null };
  }

  const hostname = normalizeAddress(parsed.hostname);
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    isPrivateIP(hostname)
  ) {
    return { error: LOCAL_NETWORK_BLOCK_MESSAGE };
  }

  const family = isIP(hostname);
  if (family) {
    return { url: parsed, addresses: [{ address: hostname, family }] };
  }

  let resolvedAddresses: ResolvedAddress[];
  try {
    resolvedAddresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { error: 'Unable to verify hostname safety' };
  }

  if (resolvedAddresses.length === 0) {
    return { error: 'Unable to verify hostname safety' };
  }

  if (resolvedAddresses.some(({ address }) => isPrivateIP(address))) {
    return { error: LOCAL_NETWORK_BLOCK_MESSAGE };
  }

  return { url: parsed, addresses: resolvedAddresses };
}

/**
 * Validate a URL against SSRF attacks.
 * Returns null if the URL is safe, or an error message string if blocked.
 *
 * Contrôle ponctuel : le navigateur Playwright re-résout le nom ensuite (fenêtre de DNS rebinding,
 * non épinglable ici ; voir l'en-tête du fichier).
 */
export async function validateUrlForSSRF(
  url: string,
  options: SsrfOptions = {},
): Promise<string | null> {
  const inspection = await inspectUrl(url, options);
  return 'error' in inspection ? inspection.error : null;
}
