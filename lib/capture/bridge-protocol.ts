/**
 * Protocole du pont entre la page Qalem et l'extension de capture (version 1).
 *
 * La page et l'extension se parlent par `window.postMessage`, relayé par un script-pont que
 * l'extension n'injecte que sur le domaine de Qalem. Le contrat est dupliqué dans le dépôt
 * `qalem-capture` (apps/extension/src/qalem/protocol.ts) : toute évolution se fait des deux côtés
 * et s'accompagne d'un changement de `BRIDGE_VERSION`.
 *
 * Le jeton de capture ne circule jamais sur ce canal : la page transmet un code d'appairage à
 * usage unique, l'extension l'échange elle-même contre un jeton auprès de l'API Qalem.
 */

import { z } from 'zod';

export const BRIDGE_CHANNEL = 'qalem-capture';
export const BRIDGE_VERSION = 1;
/** Première version de l'extension qui embarque le pont. En dessous : « extension trop ancienne ». */
export const MIN_EXTENSION_VERSION = '1.6.0';

const envelope = {
  channel: z.literal(BRIDGE_CHANNEL),
  v: z.literal(BRIDGE_VERSION),
  id: z.string().min(1).max(64),
};

export const bridgeMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('ping'), payload: z.strictObject({}) }),
  z.strictObject({
    ...envelope,
    type: z.literal('pong'),
    payload: z.strictObject({
      version: z.string().regex(/^\d+\.\d+\.\d+$/),
      protocol: z.number().int().min(1),
      capabilities: z.array(z.string().max(40)).max(20),
      paired: z.boolean(),
    }),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('pair'),
    payload: z.strictObject({ code: z.string().min(1).max(32) }),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('paired'),
    payload: z.strictObject({
      ok: z.boolean(),
      reason: z.enum(['invalid', 'network', 'rejected']).optional(),
    }),
  }),
]);

export type BridgeMessage = z.infer<typeof bridgeMessageSchema>;
export type BridgeMessageType = BridgeMessage['type'];

/** Message conforme, ou null : un message étranger ou mal formé est ignoré sans réponse. */
export function parseBridgeMessage(data: unknown): BridgeMessage | null {
  const parsed = bridgeMessageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Compare deux versions `x.y.z` : négatif si a < b, 0 si égales, positif si a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
