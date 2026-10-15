/**
 * SSRF (Server-Side Request Forgery) protection utilities.
 *
 * Validates URLs to prevent requests to internal/private network addresses.
 * Used by any API route that fetches a user-supplied URL server-side.
 *
 * Deux niveaux :
 *  - `validateUrlForSSRF` : contrôle ponctuel (schéma, nom d'hôte, adresses résolues) ;
 *  - `safeFetch` : contrôle + connexion épinglée sur l'adresse validée (anti DNS rebinding) et
 *    revalidation de chaque redirection. À utiliser pour tout `fetch` d'une URL fournie par un utilisateur.
 */
import { promises as dns } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Agent, fetch as undiciFetch, type RequestInit, type Response } from 'undici';

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
 * Contrôle ponctuel : la connexion qui suit re-résout le nom (fenêtre de DNS rebinding).
 * Pour fetcher l'URL, préférer `safeFetch`.
 */
export async function validateUrlForSSRF(
  url: string,
  options: SsrfOptions = {},
): Promise<string | null> {
  const inspection = await inspectUrl(url, options);
  return 'error' in inspection ? inspection.error : null;
}

/** Resolver for undici/net that only ever answers with the already validated addresses. */
export function createPinnedLookup(addresses: ResolvedAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    // No second DNS lookup: a changed answer cannot redirect this connection to the LAN.
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  };
}

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

export class SafeFetchRedirectError extends Error {
  constructor(
    readonly code: 'TOO_MANY_REDIRECTS' | 'BAD_REDIRECT',
    message: string,
  ) {
    super(message);
    this.name = 'SafeFetchRedirectError';
  }
}

export type SafeFetchResult = {
  response: Response;
  /** URL of the last hop (after redirects). */
  finalUrl: string;
  /** Releases the pinned connection; call once the body has been consumed. */
  dispose: () => Promise<void>;
};

const DEFAULT_MAX_REDIRECTS = 5;
const CREDENTIAL_HEADERS = ['authorization', 'cookie', 'proxy-authorization', 'x-api-key'];

/**
 * fetch for a user-supplied URL: every hop is validated, resolved once, and the socket is pinned
 * to the validated address (Host/SNI keep the original name). Redirects are never followed by the
 * runtime; each Location is revalidated. Throws SsrfBlockedError / SafeFetchRedirectError.
 */
export async function safeFetch(
  url: string,
  init: Omit<RequestInit, 'redirect' | 'dispatcher'> = {},
  options: SsrfOptions & { maxRedirects?: number } = {},
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let current = url;
  let hopInit = { ...init };

  for (let hop = 0; ; hop++) {
    const inspection = await inspectUrl(current, options);
    if ('error' in inspection) throw new SsrfBlockedError(inspection.error);

    const agent = new Agent(
      inspection.addresses
        ? {
            autoSelectFamily: true,
            connect: { lookup: createPinnedLookup(inspection.addresses) },
          }
        : {},
    );

    let response: Response;
    try {
      response = await undiciFetch(inspection.url, {
        ...hopInit,
        dispatcher: agent,
        redirect: 'manual',
      });
    } catch (error) {
      await agent.destroy();
      throw error;
    }

    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: current, dispose: () => agent.destroy() };
    }

    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => undefined);
    await agent.destroy();
    if (!location) {
      throw new SafeFetchRedirectError('BAD_REDIRECT', 'Redirect response without Location header');
    }
    if (hop >= maxRedirects) {
      throw new SafeFetchRedirectError('TOO_MANY_REDIRECTS', 'Too many redirects');
    }
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new SafeFetchRedirectError('BAD_REDIRECT', 'Invalid redirect Location');
    }

    const nextHopInit = { ...hopInit };
    const method = (hopInit.method ?? 'GET').toUpperCase();
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) && method === 'POST')
    ) {
      if (method !== 'GET' && method !== 'HEAD') nextHopInit.method = 'GET';
      delete nextHopInit.body;
    }
    if (next.origin !== inspection.url.origin && hopInit.headers) {
      const headers = new Headers(hopInit.headers as HeadersInit);
      for (const name of CREDENTIAL_HEADERS) headers.delete(name);
      nextHopInit.headers = headers;
    }
    hopInit = nextHopInit;
    current = next.href;
  }
}
