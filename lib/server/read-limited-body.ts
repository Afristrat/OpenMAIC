/**
 * Lecture bornée d'un corps de réponse, en flux.
 *
 * `await response.arrayBuffer()` / `text()` charge tout en mémoire : sans Content-Length (réponse
 * chunked) un hôte hostile peut renvoyer un flux sans fin. Ici les octets sont cumulés au fil de
 * l'eau et le flux est annulé (`reader.cancel()`) dès que le plafond est dépassé.
 */

export class ResponseTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Response body exceeds ${maxBytes} bytes`);
    this.name = 'ResponseTooLargeError';
  }
}

export type LimitedBody = {
  bytes: Uint8Array<ArrayBuffer>;
  /** Vrai si le corps a été coupé au plafond (mode `truncate` uniquement). */
  truncated: boolean;
};

export async function readLimitedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  options: { onExceed?: 'throw' | 'truncate' } = {},
): Promise<LimitedBody> {
  if (!body) return { bytes: new Uint8Array(0), truncated: false };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      if (total + value.byteLength > maxBytes) {
        if (options.onExceed === 'truncate') {
          chunks.push(value.subarray(0, maxBytes - total));
          total = maxBytes;
          await reader.cancel().catch(() => undefined);
          return { bytes: concat(chunks, total), truncated: true };
        }
        await reader.cancel().catch(() => undefined);
        throw new ResponseTooLargeError(maxBytes);
      }

      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  return { bytes: concat(chunks, total), truncated: false };
}

function concat(chunks: Uint8Array[], total: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
