import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readLtiForm } from '@/lib/lti/request';

function post(body: BodyInit, headers: Record<string, string> = {}) {
  return new NextRequest('https://qalem.ma/api/lti/launch', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', ...headers },
  });
}
describe('bounded LTI form reader', () => {
  afterEach(() => vi.useRealTimers());
  it('accepts UTF-8 form data without altering opaque values', async () => {
    const params = new URLSearchParams({ login_hint: 'élève + متعلم', state: 'A_B-' });
    expect((await readLtiForm(post(params), 1024)).get('login_hint')).toBe('élève + متعلم');
  });
  it.each([undefined, '1', '999999'])(
    'bounds actual body bytes despite Content-Length %s',
    async (length) => {
      const headers: Record<string, string> = length ? { 'content-length': length } : {};
      await expect(readLtiForm(post('state=12345', headers), 10)).rejects.toMatchObject({
        status: 413,
      });
    },
  );
  it('bounds a GET query', async () => {
    await expect(
      readLtiForm(new NextRequest('https://qalem.ma/api/lti/login?state=12345'), 10),
    ).rejects.toMatchObject({ status: 413 });
  });
  it.each(['application/json', 'text/plain', 'application/x-www-form-urlencoded-evil'])(
    'rejects media type %s',
    async (type) => {
      await expect(
        readLtiForm(post('state=a', { 'content-type': type }), 1024),
      ).rejects.toMatchObject({ status: 415 });
    },
  );
  it.each(['state=a&state=b', 'state=a&%73tate=b', 'state=a%00b', 'sta%0ate=a'])(
    'rejects ambiguous or control parameters',
    async (body) => {
      await expect(readLtiForm(post(body), 1024)).rejects.toMatchObject({ status: 400 });
    },
  );
  it('cancels a stalled body at the total deadline', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const result = readLtiForm(post(stream), 1024);
    const assertion = expect(result).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('cancels a chunked body as soon as it exceeds the cap', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('state=oversized'));
      },
      cancel,
    });
    await expect(readLtiForm(post(stream), 5)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
