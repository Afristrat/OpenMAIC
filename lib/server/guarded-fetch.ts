/**
 * `fetch` gardé contre le SSRF, réutilisable partout où une API attend une fonction `fetch`
 * (SDK IA, adaptateurs média, TTS, ASR).
 *
 * À utiliser UNIQUEMENT pour une URL fournie par un utilisateur (baseUrl saisie via l'API ou
 * l'organisation). Les fournisseurs déclarés côté serveur (Ollama, LiteLLM internes…) gardent le
 * `fetch` natif : ils sont légitimement sur le réseau privé.
 *
 * Chaque saut est validé, résolu une seule fois et la connexion est épinglée sur l'adresse
 * validée (anti DNS rebinding) ; les redirections ne sont jamais suivies par le runtime mais
 * revalidées une à une (`safeFetch`). La Response renvoyée est une Response standard dont le
 * corps est lisible ; l'agent undici qui porte la connexion est détruit dès que le corps est
 * terminé, annulé ou en erreur (ou tout de suite s'il n'y a pas de corps).
 */
import type { RequestInit as UndiciRequestInit } from 'undici';
import { safeFetch } from '@/lib/server/ssrf-guard';

type FetchInput = Parameters<typeof globalThis.fetch>[0];
type FetchInit = Parameters<typeof globalThis.fetch>[1];

async function toRequestParts(
  input: FetchInput,
  init: FetchInit,
): Promise<{ url: string; init: FetchInit }> {
  if (!(input instanceof Request)) {
    return { url: input instanceof URL ? input.href : String(input), init };
  }
  const hasBody = input.method !== 'GET' && input.method !== 'HEAD' && input.body !== null;
  return {
    url: input.url,
    init: {
      method: input.method,
      headers: input.headers,
      body: hasBody ? await input.arrayBuffer() : undefined,
      signal: input.signal,
      ...init,
    },
  };
}

/** Enveloppe le corps pour détruire l'agent quand la lecture se termine, quelle qu'en soit l'issue. */
function releaseWhenDone(
  body: ReadableStream<Uint8Array>,
  dispose: () => Promise<void>,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    await dispose().catch(() => undefined);
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          await release();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
        await release();
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await release();
      }
    },
  });
}

export const guardedFetch: typeof globalThis.fetch = async (input, init) => {
  const parts = await toRequestParts(input, init);
  // undici et le runtime partagent le même modèle de requête ; seuls les types nominaux diffèrent.
  const undiciInit = (parts.init ?? {}) as unknown as Omit<
    UndiciRequestInit,
    'redirect' | 'dispatcher'
  >;
  const { response, finalUrl, dispose } = await safeFetch(parts.url, undiciInit);

  const headers = new Headers();
  response.headers.forEach((value, key) => headers.append(key, value));
  const responseInit = { status: response.status, statusText: response.statusText, headers };

  let result: Response;
  if (response.body) {
    result = new Response(
      releaseWhenDone(response.body as unknown as ReadableStream<Uint8Array>, dispose),
      responseInit,
    );
  } else {
    await dispose().catch(() => undefined);
    result = new Response(null, responseInit);
  }
  Object.defineProperty(result, 'url', { value: finalUrl });
  return result;
};

/** Choisit la garde selon l'origine de l'URL : `undefined` garde le `fetch` natif (serveur). */
export function fetchForBaseUrl(userSuppliedBaseUrl: string | undefined): typeof fetch | undefined {
  return userSuppliedBaseUrl ? guardedFetch : undefined;
}
