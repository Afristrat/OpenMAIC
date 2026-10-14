import { describe, expect, it } from 'vitest';
import { secretsMatch } from '@/lib/server/api-key-compare';

describe('secretsMatch', () => {
  it('accepte un secret identique', () => {
    expect(secretsMatch('abc123', 'abc123')).toBe(true);
  });
  it('refuse un secret différent, plus court ou plus long', () => {
    expect(secretsMatch('abc124', 'abc123')).toBe(false);
    expect(secretsMatch('abc', 'abc123')).toBe(false);
    expect(secretsMatch('abc123456', 'abc123')).toBe(false);
  });
  it('refuse une valeur absente ou vide', () => {
    expect(secretsMatch(null, 'abc123')).toBe(false);
    expect(secretsMatch(undefined, 'abc123')).toBe(false);
    expect(secretsMatch('', 'abc123')).toBe(false);
  });
});
