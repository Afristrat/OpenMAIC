import { describe, expect, it } from 'vitest';
import { detectExtension, pairExtension, type BridgeTarget } from '@/lib/capture/bridge-client';
import {
  BRIDGE_CHANNEL,
  BRIDGE_VERSION,
  MIN_EXTENSION_VERSION,
  compareVersions,
  parseBridgeMessage,
} from '@/lib/capture/bridge-protocol';

const ORIGIN = 'https://qalem.ma';

type Sent = { channel: string; v: number; id: string; type: string; payload: unknown };
type Reply = (sent: Sent, target: FakeWindow) => void;

/** Fenêtre factice : relaie chaque message posté à un « script-pont » simulé. */
class FakeWindow implements BridgeTarget {
  location = { origin: ORIGIN };
  posted: Array<{ message: Sent; targetOrigin: string }> = [];
  private listeners = new Set<(event: MessageEvent) => void>();

  constructor(private readonly bridge: Reply | null) {}

  addEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener);
  }
  postMessage(message: unknown, targetOrigin: string) {
    const sent = message as Sent;
    this.posted.push({ message: sent, targetOrigin });
    queueMicrotask(() => this.bridge?.(sent, this));
  }
  listenerCount() {
    return this.listeners.size;
  }
  emit(data: unknown, source: unknown = this, origin: string = ORIGIN) {
    for (const listener of [...this.listeners]) {
      listener({ data, source, origin } as unknown as MessageEvent);
    }
  }
}

const pong = (id: string, version: string, paired = false) => ({
  channel: BRIDGE_CHANNEL,
  v: BRIDGE_VERSION,
  id,
  type: 'pong',
  payload: { version, protocol: 1, capabilities: ['record'], paired },
});

describe('compareVersions', () => {
  it('compare numériquement chaque segment', () => {
    expect(compareVersions('1.4.0', '1.4.0')).toBe(0);
    expect(compareVersions('1.3.9', '1.4.0')).toBeLessThan(0);
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
  });
});

describe('parseBridgeMessage', () => {
  it('ignore ce qui n’est pas un message du pont', () => {
    for (const data of [
      null,
      'ping',
      { type: 'ping' },
      { channel: 'autre', v: 1, id: 'a', type: 'ping', payload: {} },
      { channel: BRIDGE_CHANNEL, v: 2, id: 'a', type: 'ping', payload: {} },
      { channel: BRIDGE_CHANNEL, v: 1, id: 'a', type: 'inconnu', payload: {} },
      { channel: BRIDGE_CHANNEL, v: 1, id: 'a', type: 'ping', payload: { x: 1 } },
    ]) {
      expect(parseBridgeMessage(data)).toBeNull();
    }
  });
});

describe('detectExtension', () => {
  it('annonce l’extension présente avec sa version et son état d’appairage', async () => {
    const win = new FakeWindow((sent, w) => w.emit(pong(sent.id, MIN_EXTENSION_VERSION, true)));
    await expect(detectExtension(win, { timeoutMs: 50 })).resolves.toEqual({
      state: 'present',
      version: MIN_EXTENSION_VERSION,
      paired: true,
    });
    expect(win.posted[0].targetOrigin).toBe(ORIGIN);
    expect(win.posted[0].message).toMatchObject({ channel: BRIDGE_CHANNEL, v: 1, type: 'ping' });
    expect(win.listenerCount()).toBe(0);
  });

  it('annonce une extension trop ancienne', async () => {
    const win = new FakeWindow((sent, w) => w.emit(pong(sent.id, '1.3.0')));
    await expect(detectExtension(win, { timeoutMs: 50 })).resolves.toMatchObject({
      state: 'outdated',
      version: '1.3.0',
    });
  });

  it('conclut « absente » seulement après un second essai, sans lever d’erreur', async () => {
    const win = new FakeWindow(null);
    await expect(detectExtension(win, { timeoutMs: 20, retries: 1 })).resolves.toEqual({
      state: 'absent',
    });
    expect(win.posted).toHaveLength(2);
    expect(win.listenerCount()).toBe(0);
  });

  it('trouve une extension injectée tardivement grâce au second essai', async () => {
    let calls = 0;
    const win = new FakeWindow((sent, w) => {
      calls += 1;
      if (calls === 2) w.emit(pong(sent.id, MIN_EXTENSION_VERSION));
    });
    const status = await detectExtension(win, { timeoutMs: 30, retries: 1 });
    expect(status.state).toBe('present');
  });

  it('ignore une réponse venue d’une autre fenêtre, d’une autre origine ou d’un autre échange', async () => {
    const win = new FakeWindow((sent, w) => {
      w.emit(pong(sent.id, MIN_EXTENSION_VERSION), { not: 'la fenêtre' });
      w.emit(pong(sent.id, MIN_EXTENSION_VERSION), w, 'https://evil.example');
      w.emit(pong('autre-id', MIN_EXTENSION_VERSION));
      w.emit({ ...pong(sent.id, MIN_EXTENSION_VERSION), channel: 'autre' });
    });
    await expect(detectExtension(win, { timeoutMs: 30, retries: 0 })).resolves.toEqual({
      state: 'absent',
    });
  });
});

describe('pairExtension', () => {
  const answer =
    (payload: unknown): Reply =>
    (sent, w) =>
      w.emit({ channel: BRIDGE_CHANNEL, v: BRIDGE_VERSION, id: sent.id, type: 'paired', payload });

  it('transmet le code à l’extension et rapporte le succès', async () => {
    const win = new FakeWindow(answer({ ok: true }));
    await expect(pairExtension('ABCD2345', win, 50)).resolves.toEqual({ ok: true });
    expect(win.posted[0].message).toMatchObject({ type: 'pair', payload: { code: 'ABCD2345' } });
  });

  it('rapporte le motif d’un refus', async () => {
    const win = new FakeWindow(answer({ ok: false, reason: 'invalid' }));
    await expect(pairExtension('ABCD2345', win, 50)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('rapporte « absente » quand l’extension ne répond pas', async () => {
    await expect(pairExtension('ABCD2345', new FakeWindow(null), 20)).resolves.toEqual({
      ok: false,
      reason: 'absent',
    });
  });
});
