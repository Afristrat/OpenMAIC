import { describe, expect, it } from 'vitest';
import { formatMarketplaceDate } from '@/lib/marketplace/format-date';

describe('formatMarketplaceDate', () => {
  it('returns the UTC calendar date independently of the runtime timezone', () => {
    expect(formatMarketplaceDate('2026-08-07T23:30:00-04:00')).toBe('2026-08-08');
  });

  it('does not render an invalid date', () => {
    expect(formatMarketplaceDate('not-a-date')).toBe('');
  });
});
