import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/00047_invitation_only_signup.sql'),
  'utf8',
);
const metadataCorrection = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/00048_invitation_token_insert_metadata.sql'),
  'utf8',
);

describe('invitation-only signup migration', () => {
  it('revokes legacy anonymous invitations and requires an email', () => {
    expect(migration).toMatch(/WHERE email IS NULL/i);
    expect(migration).toMatch(/used_at = COALESCE\(used_at, now\(\)\)/i);
    expect(migration).toMatch(/ALTER COLUMN email SET NOT NULL/i);
  });

  it('claims the invitation inside the auth user transaction', () => {
    expect(migration).toMatch(/AFTER INSERT ON auth\.users/i);
    expect(migration).toMatch(/FOR UPDATE/i);
    expect(migration).toMatch(/lower\(invitation\.email\) <> lower\(NEW\.email\)/i);
    expect(migration).toMatch(/INSERT INTO public\.org_members/i);
    expect(migration).toMatch(/UPDATE public\.org_invitations\s+SET used_at = now\(\)/i);
    expect(migration).toMatch(/SECURITY DEFINER\s+SET search_path = ''/i);
    expect(migration).toMatch(/claim_invitation_for_existing_user/i);
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]+TO service_role/i);
    expect(migration).toMatch(
      /ON CONFLICT ON CONSTRAINT org_members_user_id_org_id_key DO NOTHING/i,
    );
  });

  it('reads the token from metadata persisted in the initial GoTrue insert', () => {
    expect(metadataCorrection).toMatch(/CREATE OR REPLACE FUNCTION public\.claim_invitation/i);
    expect(metadataCorrection).toMatch(/NEW\.raw_user_meta_data\s*->>\s*'qalem_invitation_token'/i);
    expect(metadataCorrection).toMatch(/COALESCE\(/i);
    expect(metadataCorrection).toMatch(/FOR UPDATE/i);
    expect(metadataCorrection).toMatch(/lower\(invitation\.email\) <> lower\(NEW\.email\)/i);
  });
});
