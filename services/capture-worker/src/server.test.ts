import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.mock('./capture.js', () => ({
  runCapture: vi.fn(),
}));

const { app } = await import('./server.js');
const { runCapture } = await import('./capture.js');

let server: Server;
let baseUrl: string;

beforeAll(() => {
  return new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.mocked(runCapture).mockReset();
  delete process.env.CAPTURE_WORKER_TOKEN;
});

const validBody = {
  url: 'https://1.1.1.1/page',
  interactionSteps: [],
  format: 'image' as const,
};

describe('POST /capture', () => {
  it('rejects with 401 when no Authorization header is sent', async () => {
    process.env.CAPTURE_WORKER_TOKEN = 'secret-token';
    const res = await fetch(`${baseUrl}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
    expect(runCapture).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the token is wrong', async () => {
    process.env.CAPTURE_WORKER_TOKEN = 'secret-token';
    const res = await fetch(`${baseUrl}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
    expect(runCapture).not.toHaveBeenCalled();
  });

  it('rejects with 400 when the URL is SSRF-blocked, even with a valid token', async () => {
    process.env.CAPTURE_WORKER_TOKEN = 'secret-token';
    const res = await fetch(`${baseUrl}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
      body: JSON.stringify({ ...validBody, url: 'http://127.0.0.1:8090/admin' }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(false);
    expect(runCapture).not.toHaveBeenCalled();
  });

  it('calls runCapture and returns 200 with a valid token and a safe URL', async () => {
    process.env.CAPTURE_WORKER_TOKEN = 'secret-token';
    vi.mocked(runCapture).mockResolvedValue({
      success: true,
      buffer: Buffer.from('fake-png'),
      contentType: 'image/png',
    });
    const res = await fetch(`${baseUrl}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);
    expect(runCapture).toHaveBeenCalledTimes(1);
  });

  it('rejects a second capture while Chromium capacity is occupied', async () => {
    process.env.CAPTURE_WORKER_TOKEN = 'secret-token';
    let releaseCapture!: () => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    vi.mocked(runCapture).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          signalStarted();
          releaseCapture = () =>
            resolve({
              success: true,
              buffer: Buffer.from('fake-png'),
              contentType: 'image/png',
            });
        }),
    );

    const firstCapture = fetch(`${baseUrl}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
      body: JSON.stringify(validBody),
    });
    await started;

    const secondCapture = await fetch(`${baseUrl}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
      body: JSON.stringify(validBody),
    });

    expect(secondCapture.status).toBe(429);
    expect(secondCapture.headers.get('retry-after')).toBe('5');
    releaseCapture();
    await expect(firstCapture).resolves.toMatchObject({ status: 200 });
  });
});
