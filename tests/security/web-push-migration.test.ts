import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Web Push persistence migration', () => {
  it('scopes subscriptions and delivery evidence to the authenticated owner', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/00042_web_push.sql'),
      'utf8',
    );

    expect(sql).toContain('ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE public.web_push_deliveries ENABLE ROW LEVEL SECURITY');
    expect(sql.match(/auth\.uid\(\) = user_id/g)).toHaveLength(6);
    expect(sql).toContain('web_push_deliveries_insert_service_only');
    expect(sql).toContain('WITH CHECK (false)');
    expect(sql).toContain("endpoint ~ '^https://'");
    expect(sql).toContain('char_length(p256dh) = 87');
    expect(sql).toContain('char_length(auth) = 22');
    expect(sql).toContain("target_url ~ '^/[^/]'");
  });
});
