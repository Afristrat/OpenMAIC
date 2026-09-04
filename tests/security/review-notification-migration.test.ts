import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('review notification persistence migration', () => {
  it('enforces opt-in, ownership, daily channel deduplication and service-only claims', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/00070_review_notification_channels.sql'),
      'utf8',
    );

    expect(sql).toContain(
      'ALTER TABLE public.review_notification_preferences ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).toContain(
      'ALTER TABLE public.review_notification_deliveries ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).toContain('UNIQUE (user_id, channel, batch_key)');
    expect(sql).toContain("channel IN ('email', 'whatsapp')");
    expect(sql).toContain("whatsapp_number ~ '^\\+[1-9][0-9]{7,14}$'");
    expect(sql).toContain('NOT whatsapp_enabled OR whatsapp_number IS NOT NULL');
    expect(sql).toContain('ON CONFLICT (user_id, channel, batch_key) DO NOTHING');
    expect(sql).toContain('FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('TO service_role');
    expect(sql).toContain('USING (user_id = auth.uid())');
    expect(sql).toContain('WITH CHECK (false)');
  });
});
