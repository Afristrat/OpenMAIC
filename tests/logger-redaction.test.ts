import { describe, expect, it } from 'vitest';
import { redactSensitiveLogData } from '@/lib/logger';

describe('logger redaction', () => {
  it('redacts provider keys, bearer tokens and secret query parameters', () => {
    const line = redactSensitiveLogData(
      'API key: sk-test_FAKE123456 Authorization: Bearer fake-token-123456 ?token=fake-query-123',
    );

    expect(line).not.toContain('FAKE123456');
    expect(line).not.toContain('fake-token-123456');
    expect(line).not.toContain('fake-query-123');
    expect(line.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('preserves ordinary operational context', () => {
    expect(redactSensitiveLogData('Image generation failed with HTTP 402')).toBe(
      'Image generation failed with HTTP 402',
    );
  });
});
