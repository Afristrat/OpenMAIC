import { describe, expect, it } from 'vitest';
import { InsufficientCreditsError } from '@/lib/billing/insufficient-credits';
import {
  CREDITS_BLOCKED_I18N_KEY,
  CreditsBlockedError,
  creditsAwareMessage,
  isInsufficientCreditsPayload,
  resolveErrorMessage,
  streamErrorData,
  throwIfCreditsBlocked,
} from '@/lib/billing/credit-error-message';

const t = (key: string): string => `[${key}]`;

describe('isInsufficientCreditsPayload', () => {
  it.each([
    [{ errorCode: 'INSUFFICIENT_CREDITS' }, true],
    [{ code: 'INSUFFICIENT_CREDITS' }, true],
    [{ errorCode: 'INTERNAL_ERROR' }, false],
    [{}, false],
    [null, false],
    ['INSUFFICIENT_CREDITS', false],
  ])('%j -> %s', (payload, expected) => {
    expect(isInsufficientCreditsPayload(payload)).toBe(expected);
  });
});

describe('resolveErrorMessage', () => {
  it('traduit le blocage de solde dans la langue courante', () => {
    expect(resolveErrorMessage({ errorCode: 'INSUFFICIENT_CREDITS', error: 'brut' }, t, 'x')).toBe(
      `[${CREDITS_BLOCKED_I18N_KEY}]`,
    );
  });

  it("reprend le message brut d'une autre erreur", () => {
    expect(resolveErrorMessage({ error: 'brut' }, t, 'repli')).toBe('brut');
  });

  it('retombe sur le repli quand rien n’est lisible', () => {
    expect(resolveErrorMessage(null, t, 'repli')).toBe('repli');
  });
});

describe('streamErrorData', () => {
  it('porte le code stable quand le solde est épuisé, même enveloppé', () => {
    const wrapped = new Error('échec', { cause: new Error('INSUFFICIENT_TENANT_CREDITS') });

    expect(streamErrorData(new InsufficientCreditsError())).toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
    });
    expect(streamErrorData(wrapped)).toMatchObject({
      message: 'échec',
      code: 'INSUFFICIENT_CREDITS',
    });
  });

  it('ne pose aucun code pour une autre erreur', () => {
    expect(streamErrorData(new Error('boom'))).toEqual({ message: 'boom' });
    expect(streamErrorData('texte')).toEqual({ message: 'texte' });
  });
});

describe('CreditsBlockedError et throwIfCreditsBlocked', () => {
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status });

  it('lève CreditsBlockedError sur un 402 INSUFFICIENT_CREDITS et laisse le corps lisible', async () => {
    const response = json(402, { success: false, errorCode: 'INSUFFICIENT_CREDITS' });

    await expect(throwIfCreditsBlocked(response)).rejects.toBeInstanceOf(CreditsBlockedError);
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'INSUFFICIENT_CREDITS' });
  });

  it('ne lève rien pour un autre statut ou un 402 sans ce code', async () => {
    await expect(throwIfCreditsBlocked(json(500, {}))).resolves.toBeUndefined();
    await expect(throwIfCreditsBlocked(json(402, { errorCode: 'OTHER' }))).resolves.toBeUndefined();
    await expect(throwIfCreditsBlocked(new Response('pas du json', { status: 402 }))).resolves.toBe(
      undefined,
    );
  });

  it('creditsAwareMessage traduit uniquement CreditsBlockedError', () => {
    expect(creditsAwareMessage(new CreditsBlockedError(), t, 'repli')).toBe(
      `[${CREDITS_BLOCKED_I18N_KEY}]`,
    );
    expect(creditsAwareMessage(new Error('x'), t, 'repli')).toBe('repli');
  });
});
