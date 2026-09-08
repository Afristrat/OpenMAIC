import { promises as dns } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { Agent, fetch as fetchDirect } from 'undici';
import { isPrivateIP } from '@/lib/server/ssrf-guard';

export class LtiNetworkPolicyError extends Error {
  constructor() {
    super('LTI endpoint or response rejected');
  }
}

// LTI only: do not change the LAN policy of self-hosted AI providers.
// IANA special-purpose registries; conservative exclusion of transition/protocol ranges.
const reserved = new BlockList();
for (const [address, prefix] of [
  ['100.64.0.0', 10],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const)
  reserved.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const)
  reserved.addSubnet(address, prefix, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
function publicAddress(address: string): boolean {
  const family = isIP(address);
  return (
    !!family &&
    !isPrivateIP(address) &&
    (family === 4
      ? !reserved.check(address, 'ipv4')
      : globalV6.check(address, 'ipv6') && !reserved.check(address, 'ipv6'))
  );
}

export type LtiRequest = {
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
};

/** Resolve once, pin the TLS connection, bound decoded bytes, and release every socket. */
export async function requestLtiEndpoint(
  endpoint: string,
  init: LtiRequest,
  maxBytes: number,
): Promise<Response> {
  if (!URL.canParse(endpoint)) throw new LtiNetworkPolicyError();
  const url = new URL(endpoint);
  const hostname = url.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  )
    throw new LtiNetworkPolicyError();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('LTI request timed out')), 15000);
  let agent: Agent | undefined;
  try {
    const family = isIP(hostname);
    const addresses = family
      ? [{ address: hostname, family }]
      : await Promise.race([
          dns.lookup(hostname, { all: true, verbatim: true }),
          new Promise<never>((_, reject) =>
            controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {
              once: true,
            }),
          ),
        ]);
    if (addresses.length === 0 || addresses.some(({ address }) => !publicAddress(address)))
      throw new LtiNetworkPolicyError();
    agent = new Agent({
      autoSelectFamily: true,
      connect: {
        rejectUnauthorized: true,
        lookup: (_name, options, callback) => {
          // No second DNS lookup: a changed answer cannot redirect this request to the LAN.
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        },
      },
    });
    const response = await fetchDirect(url, {
      ...init,
      dispatcher: agent,
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) throw new LtiNetworkPolicyError();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) throw new LtiNetworkPolicyError();
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
    }
    // Detached, bounded response: callers cannot accidentally retain the dispatcher/socket.
    return new Response(
      response.status === 204 || response.status === 205
        ? null
        : Buffer.concat(chunks).toString('utf8'),
      {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
        },
      },
    );
  } finally {
    clearTimeout(timeout);
    await agent?.destroy();
  }
}
