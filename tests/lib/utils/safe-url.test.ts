import { describe, expect, it } from 'vitest';
import { safeHttpUrl } from '@/lib/utils/safe-url';

describe('safeHttpUrl', () => {
  it('conserve les URL http et https', () => {
    expect(safeHttpUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHttpUrl('HTTP://example.com')).toBe('HTTP://example.com');
  });

  it.each([
    'javascript:alert(1)',
    ' javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//example.com',
    '/relatif',
    '',
  ])('refuse %j', (value) => {
    expect(safeHttpUrl(value)).toBeUndefined();
  });

  it('refuse les valeurs qui ne sont pas des chaînes', () => {
    expect(safeHttpUrl(undefined)).toBeUndefined();
    expect(safeHttpUrl(null)).toBeUndefined();
    expect(safeHttpUrl(42)).toBeUndefined();
  });
});
