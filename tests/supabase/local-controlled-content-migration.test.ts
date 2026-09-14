import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260914110000_local_controlled_content.sql'),
  'utf8',
);

describe('local controlled content migration (S2-012)', () => {
  it('binds each local device to its user and tenant with an Ed25519 public key', () => {
    expect(migration).toMatch(/CREATE TABLE public\.local_client_devices/i);
    expect(migration).toMatch(/user_id UUID NOT NULL REFERENCES public\.profiles/i);
    expect(migration).toMatch(/org_id UUID NOT NULL REFERENCES public\.organizations/i);
    expect(migration).toMatch(/device_id UUID NOT NULL/i);
    expect(migration).toMatch(/char_length\(public_key\) = 43/i);
    expect(migration).toMatch(/UNIQUE \(user_id, org_id, device_id\)/i);
  });

  it('keeps an expirable and revocable licence for one enrolled device and package', () => {
    expect(migration).toMatch(/CREATE TABLE public\.local_content_licenses/i);
    expect(migration).toMatch(/device_id UUID NOT NULL REFERENCES public\.local_client_devices/i);
    expect(migration).toMatch(/content_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/i);
    expect(migration).toMatch(/signed_manifest JSONB NOT NULL/i);
    expect(migration).toMatch(/key_envelope TEXT NOT NULL/i);
    expect(migration).toMatch(/expires_at > issued_at/i);
    expect(migration).toMatch(/UNIQUE \(device_id, package_id\)/i);
    expect(migration).toMatch(/revoked_at TIMESTAMPTZ/i);
  });

  it('fails closed for the browser Data API while retaining service-side access', () => {
    expect(migration).toMatch(
      /ALTER TABLE public\.local_client_devices ENABLE ROW LEVEL SECURITY/i,
    );
    expect(migration).toMatch(
      /ALTER TABLE public\.local_content_licenses ENABLE ROW LEVEL SECURITY/i,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE public\.local_client_devices FROM anon, authenticated/i,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE public\.local_content_licenses FROM anon, authenticated/i,
    );
    expect(migration).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.local_client_devices TO service_role/i,
    );
    expect(migration).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.local_content_licenses TO service_role/i,
    );
  });
});
