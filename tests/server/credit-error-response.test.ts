import { describe, expect, it } from 'vitest';
import { APICallError, RetryError } from 'ai';
import { InsufficientCreditsError } from '@/lib/billing/insufficient-credits';
import { creditsErrorResponse } from '@/lib/server/credit-error-response';
import { llmApiError } from '@/lib/server/llm-error-response';

/** Erreur Postgres telle que la remontent les SDK : le texte d'origine n'est que dans la cause. */
function wrappedPostgresError(): Error {
  const postgres = new Error('INSUFFICIENT_TENANT_CREDITS');
  return new Error('Failed to post usage', { cause: postgres });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('creditsErrorResponse', () => {
  it('répond 402 avec le code stable pour une InsufficientCreditsError', async () => {
    const response = creditsErrorResponse(new InsufficientCreditsError());

    expect(response?.status).toBe(402);
    expect(await body(response as Response)).toMatchObject({
      success: false,
      errorCode: 'INSUFFICIENT_CREDITS',
    });
  });

  it("retrouve l'erreur Postgres enveloppée dans une cause", () => {
    expect(creditsErrorResponse(wrappedPostgresError())?.status).toBe(402);
  });

  it('retrouve l’erreur dans un AggregateError', () => {
    const aggregate = new AggregateError([new Error('autre'), new InsufficientCreditsError()]);

    expect(creditsErrorResponse(aggregate)?.status).toBe(402);
  });

  it('renvoie null pour toute autre erreur', () => {
    expect(creditsErrorResponse(new Error('boom'))).toBeNull();
    expect(creditsErrorResponse('texte')).toBeNull();
    expect(creditsErrorResponse(undefined)).toBeNull();
  });
});

describe('llmApiError et solde insuffisant', () => {
  it('répond 402 INSUFFICIENT_CREDITS pour une InsufficientCreditsError', async () => {
    const response = llmApiError(new InsufficientCreditsError());

    expect(response.status).toBe(402);
    expect(await body(response)).toMatchObject({ errorCode: 'INSUFFICIENT_CREDITS' });
  });

  it("répond 402 pour l'erreur Postgres enveloppée", async () => {
    const response = llmApiError(wrappedPostgresError());

    expect(response.status).toBe(402);
    expect(await body(response)).toMatchObject({ errorCode: 'INSUFFICIENT_CREDITS' });
  });

  it('prime sur un statut amont porté par une enveloppe du SDK', async () => {
    const upstream = new APICallError({
      message: 'INSUFFICIENT_TENANT_CREDITS',
      url: 'https://llm.invalid',
      requestBodyValues: {},
      statusCode: 500,
    });
    const retry = new RetryError({
      message: 'retries exhausted',
      reason: 'maxRetriesExceeded',
      errors: [upstream],
    });

    expect((await llmApiError(retry)).status).toBe(402);
  });

  it('garde le comportement existant pour les autres erreurs', () => {
    expect(llmApiError(new Error('boom')).status).toBe(500);
  });
});
