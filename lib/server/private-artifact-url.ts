import { createServiceSupabaseClient } from '@/lib/supabase/service';

/** Call only after row authorization and canonical artifact-path validation. */
export async function privateArtifactUrl(
  bucket: 'exports' | 'transmissions',
  path: string,
  signal: AbortSignal,
  download: boolean,
): Promise<string> {
  const { data, error } = await createServiceSupabaseClient(
    AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  )
    .storage.from(bucket)
    .createSignedUrl(path, 60, { download });
  if (error || !data?.signedUrl) throw new Error('Artifact signing unavailable');
  const target = new URL(data.signedUrl);
  if (
    target.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin ||
    !['http:', 'https:'].includes(target.protocol)
  )
    throw new Error('Invalid storage origin');
  return target.href;
}
