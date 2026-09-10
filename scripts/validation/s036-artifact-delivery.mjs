// Explicit, isolated Storage integration proof; run only inside the Qalem worker.
// Credentials and signed URLs never leave the process. Only our new file is removed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
assert(process.argv.includes('--execute-qalem-storage-proof'), 'Explicit execution flag required');
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(base && key, 'Qalem Storage environment required');
const db = createClient(base, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([
          AbortSignal.timeout(15000),
          ...(init?.signal ? [init.signal] : []),
        ]),
      }),
  },
});
const filename = `${randomUUID()}.bin`;
const path = `s036-artifact-proof/${filename}`;
const bytes = new Uint8Array(128).map((_, index) => index);
let uploaded = false;
try {
  const upload = await db.storage
    .from('exports')
    .upload(path, bytes, { contentType: 'application/octet-stream', upsert: false });
  assert(!upload.error, 'Synthetic upload failed');
  uploaded = true;
  console.log(JSON.stringify({ step: 'uploaded', path, size: bytes.length }));
  const signed = await db.storage.from('exports').createSignedUrl(path, 60, { download: true });
  assert(!signed.error && signed.data?.signedUrl, 'Synthetic signing failed');
  assert(
    new URL(signed.data.signedUrl).origin === new URL(base).origin,
    'Unexpected signing origin',
  );
  const response = await fetch(signed.data.signedUrl, {
    headers: { Range: 'bytes=0-3' },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 206, 'Range response missing');
  assert.equal(response.headers.get('content-range'), 'bytes 0-3/128');
  assert(
    response.headers.get('content-disposition')?.startsWith('attachment'),
    'Attachment disposition missing',
  );
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes.slice(0, 4));
  console.log(
    JSON.stringify({ step: 'range-verified', status: response.status, bytes: 4, attachment: true }),
  );
} finally {
  if (uploaded) {
    const removal = await db.storage.from('exports').remove([path]);
    assert(!removal.error, 'Synthetic file cleanup requires attention');
    const remaining = await db.storage
      .from('exports')
      .list('s036-artifact-proof', { search: filename, limit: 1 });
    assert(!remaining.error && remaining.data?.length === 0, 'Synthetic file removal unconfirmed');
    console.log(JSON.stringify({ step: 'removed', path }));
  }
}
