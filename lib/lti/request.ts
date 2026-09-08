import type { NextRequest } from 'next/server';

export class LtiFormError extends Error {
  constructor(public readonly status: number) {
    super('Invalid LTI form');
  }
}

/** Bound actual bytes before parsing; do not trust Content-Length on public login endpoints. */
export async function readLtiForm(req: NextRequest, maxBytes: number): Promise<URLSearchParams> {
  let body: string;
  if (req.method === 'GET') {
    body = req.nextUrl.search.slice(1);
    if (Buffer.byteLength(body) > maxBytes) throw new LtiFormError(413);
  } else {
    const mediaType = req.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (mediaType !== 'application/x-www-form-urlencoded') throw new LtiFormError(415);
    const reader = req.body?.getReader();
    if (!reader) throw new LtiFormError(400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new LtiFormError(408)), 15000);
    });
    try {
      while (true) {
        const { value, done } = await Promise.race([reader.read(), deadline]);
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new LtiFormError(413);
        chunks.push(value);
      }
      body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    } catch (error) {
      throw error instanceof LtiFormError ? error : new LtiFormError(400);
    } finally {
      clearTimeout(timer);
      // Cancellation also releases a pending read when the deadline wins.
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
  const params = new URLSearchParams(body);
  const names = new Set<string>();
  for (const [name, value] of params) {
    if (names.has(name) || name.length > 256 || [...name + value].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ))
      throw new LtiFormError(400);
    names.add(name);
  }
  return params;
}
