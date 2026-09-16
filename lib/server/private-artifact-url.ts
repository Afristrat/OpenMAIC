import { createServiceSupabaseClient } from '@/lib/supabase/service';

export function publicArtifactUrl(
  signedUrl: string,
  publicSupabaseUrl: string,
  internalSupabaseUrl?: string,
): string {
  const target = new URL(signedUrl);
  const publicOrigin = new URL(publicSupabaseUrl).origin;
  const internalOrigin = internalSupabaseUrl ? new URL(internalSupabaseUrl).origin : undefined;

  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('Invalid storage origin');
  }
  if (target.origin === publicOrigin) return target.href;
  if (target.origin !== internalOrigin) throw new Error('Invalid storage origin');

  const publicUrl = new URL(publicSupabaseUrl);
  target.protocol = publicUrl.protocol;
  target.host = publicUrl.host;
  target.port = publicUrl.port;
  return target.href;
}

/** Call only after row authorization and canonical artifact-path validation. */
export async function privateArtifactUrl(
  bucket: 'exports' | 'transmissions',
  path: string,
  download: boolean,
): Promise<string> {
  // The lifecycle signal of a Next.js request may be cancelled while its
  // handler is still issuing a server-side redirect. It must not cancel the
  // independent Storage signing request; retain a strict local timeout.
  const { data, error } = await createServiceSupabaseClient(
    AbortSignal.timeout(5000),
  )
    .storage.from(bucket)
    .createSignedUrl(path, 60, { download });
  if (error || !data?.signedUrl) throw new Error('Artifact signing unavailable');
  return publicArtifactUrl(
    data.signedUrl,
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_INTERNAL_URL,
  );
}
