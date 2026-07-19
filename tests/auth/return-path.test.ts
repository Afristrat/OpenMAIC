import { describe, expect, it } from 'vitest';
import { resolveAuthReturnPath } from '@/lib/auth/return-path';

describe('resolveAuthReturnPath', () => {
  it('préserve la destination Qalem et la skill sélectionnée', () => {
    expect(resolveAuthReturnPath('/app?skill=formation-design-pro')).toBe(
      '/app?skill=formation-design-pro',
    );
  });

  it.each([
    null,
    '',
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example/steal',
  ])('rejette une destination non interne : %s', (value) => {
    expect(resolveAuthReturnPath(value)).toBe('/app');
  });
});
