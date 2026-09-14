import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260914110000_local_controlled_content.sql'),
  'utf8',
);

describe('local controlled content migration (S2-012)', () => {
  it('binds each local device to its user and tenant with an X25519 encryption key', () => {
    expect(migration).toMatch(/CREATE TABLE public\.local_client_devices/i);
    expect(migration).toMatch(/user_id UUID NOT NULL REFERENCES public\.profiles/i);
    expect(migration).toMatch(/org_id UUID NOT NULL REFERENCES public\.organizations/i);
    expect(migration).toMatch(/device_id UUID NOT NULL/i);
    expect(migration).toMatch(/char_length\(encryption_public_key\) = 43/i);
    expect(migration).toMatch(/UNIQUE \(user_id, org_id, device_id\)/i);
  });

  it('keeps an expirable and revocable licence for one enrolled device and package', () => {
    expect(migration).toMatch(/CREATE TABLE public\.local_content_packages/i);
    expect(migration).toMatch(
      /FOREIGN KEY \(source_id, org_id\)\s+REFERENCES public\.organization_sources\(id, org_id\)/i,
    );
    expect(migration).toMatch(/source\.content_hash = NEW\.source_content_sha256/i);
    expect(migration).toMatch(/NEW\.source_id = ANY \(manifest\.source_ids\)/i);
    expect(migration).toMatch(
      /payload_bytes INTEGER NOT NULL CHECK \(payload_bytes BETWEEN 1 AND 5242880\)/i,
    );
    expect(migration).toMatch(
      /content_sha256 TEXT NOT NULL CHECK \(content_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/i,
    );
    expect(migration).toMatch(/CREATE TABLE public\.local_content_licenses/i);
    expect(migration).toMatch(
      /package_id UUID NOT NULL REFERENCES public\.local_content_packages/i,
    );
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
      /ALTER TABLE public\.local_content_packages ENABLE ROW LEVEL SECURITY/i,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE public\.local_client_devices FROM anon, authenticated/i,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE public\.local_content_licenses FROM anon, authenticated/i,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE public\.local_content_packages FROM anon, authenticated/i,
    );
    expect(migration).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.local_client_devices TO service_role/i,
    );
    expect(migration).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.local_content_licenses TO service_role/i,
    );
    expect(migration).toMatch(/VALUES \(\s*'local-content-packages'/i);
    expect(migration).toMatch(/local_content_packages_select_service_only/i);
    expect(migration).toMatch(/assert_local_content_license_integrity/i);
    expect(migration).toMatch(/device\.user_id = NEW\.user_id/i);
    expect(migration).toMatch(/package\.content_sha256 = NEW\.content_sha256/i);
  });
});
