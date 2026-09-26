import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('RTL navigation icons', () => {
  it('mirrors the organization administration back arrow', () => {
    const source = readFileSync(resolve('app/org/[orgId]/admin/page.tsx'), 'utf8');

    expect(source).toContain('<ArrowLeft className="h-5 w-5 rtl-flip" />');
  });
});
