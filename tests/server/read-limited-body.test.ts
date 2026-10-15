import { describe, expect, it, vi } from 'vitest';
import { readLimitedBody, ResponseTooLargeError } from '@/lib/server/read-limited-body';

function chunked(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]));
      else controller.close();
    },
  });
}

/** Flux sans fin : ne se termine que s'il est annulé. */
function endless(onCancel: () => void): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(1024).fill(97);
  return new ReadableStream({
    pull(controller) {
      controller.enqueue(chunk);
    },
    cancel() {
      onCancel();
    },
  });
}

describe('readLimitedBody', () => {
  it('lit un corps complet sous le plafond', async () => {
    const result = await readLimitedBody(chunked(['bon', 'jour']), 100);
    expect(new TextDecoder().decode(result.bytes)).toBe('bonjour');
    expect(result.truncated).toBe(false);
  });

  it('renvoie un corps vide pour un body null', async () => {
    const result = await readLimitedBody(null, 10);
    expect(result.bytes.byteLength).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('mode troncature : coupe exactement au plafond et annule le flux sans fin', async () => {
    const cancel = vi.fn();
    const result = await readLimitedBody(endless(cancel), 2500, { onExceed: 'truncate' });
    expect(result.bytes.byteLength).toBe(2500);
    expect(result.truncated).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('mode rejet (défaut) : lève ResponseTooLargeError et annule le flux sans fin', async () => {
    const cancel = vi.fn();
    await expect(readLimitedBody(endless(cancel), 5000)).rejects.toBeInstanceOf(
      ResponseTooLargeError,
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('accepte un corps pile au plafond', async () => {
    const result = await readLimitedBody(chunked(['abcd']), 4);
    expect(result.bytes.byteLength).toBe(4);
    expect(result.truncated).toBe(false);
  });
});
