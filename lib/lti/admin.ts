import { z } from 'zod';
import type { NextRequest } from 'next/server';

const identifier = z.string().trim().min(1).max(4096);
const endpoint = identifier.refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
});
export const ltiPlatformInput = z
  .object({
    clientId: identifier,
    issuer: endpoint,
    jwksUrl: endpoint,
    authUrl: endpoint,
    tokenUrl: endpoint,
    deploymentId: identifier,
    orgId: z.uuid(),
  })
  .strict();
export const ltiPlatformRow = z.object({
  id: z.uuid(),
  client_id: identifier,
  issuer: identifier,
  jwks_url: identifier,
  auth_url: identifier,
  token_url: identifier,
  deployment_id: identifier,
  org_id: z.uuid().nullable(),
});
export const LTI_PLATFORM_FIELDS =
  'id,client_id,issuer,jwks_url,auth_url,token_url,deployment_id,org_id';
export function platformView(row: z.infer<typeof ltiPlatformRow>) {
  return {
    id: row.id,
    clientId: row.client_id,
    issuer: row.issuer,
    jwksUrl: row.jwks_url,
    authUrl: row.auth_url,
    tokenUrl: row.token_url,
    deploymentId: row.deployment_id,
    orgId: row.org_id,
  };
}
export class LtiAdminRequestError extends Error {
  constructor(public readonly status: number) {
    super('Invalid LTI administration request');
  }
}
/** Invoke only after super-admin authentication. Bound the stream, not a claimed Content-Length. */
export async function readLtiAdminBody(req: NextRequest): Promise<unknown> {
  const appUrl = process.env.LTI_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !URL.canParse(appUrl) || req.headers.get('origin') !== new URL(appUrl).origin)
    throw new LtiAdminRequestError(403);
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new LtiAdminRequestError(415);
  const reader = req.body?.getReader();
  if (!reader) throw new LtiAdminRequestError(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new LtiAdminRequestError(413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof LtiAdminRequestError) throw error;
    throw new LtiAdminRequestError(400);
  } finally {
    reader.releaseLock();
  }
}
