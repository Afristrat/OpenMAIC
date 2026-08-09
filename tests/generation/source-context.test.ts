import { describe, expect, test } from 'vitest';
import { selectSourceContext } from '@/lib/generation/source-context';

describe('selectSourceContext', () => {
  test('retains evidence from the beginning, middle and end within the budget', () => {
    const source = `BEGINNING-${'a'.repeat(120)}-MIDDLE-${'b'.repeat(120)}-CONCLUSION`;
    const selected = selectSourceContext(source, 180);

    expect(selected.length).toBeLessThanOrEqual(180);
    expect(selected).toContain('BEGINNING');
    expect(selected).toContain('MIDDLE');
    expect(selected).toContain('CONCLUSION');
    expect(selected).toContain('sections omitted');
  });

  test('leaves a short source unchanged', () => {
    expect(selectSourceContext('  complete source  ', 100)).toBe('complete source');
  });
});
