import { describe, expect, it } from 'vitest';
import { getSystemBlueprints } from '@/lib/formation-engine/system-blueprints';

describe('getSystemBlueprints', () => {
  it('fournit six trames réutilisables dans les trois langues', () => {
    for (const locale of ['fr-FR', 'ar-MA', 'en-US']) {
      const templates = getSystemBlueprints(locale);
      expect(templates).toHaveLength(6);
      expect(new Set(templates.map((template) => template.id)).size).toBe(6);
      expect(templates.every((template) => template.requirements.requirement)).toBe(true);
    }
  });

  it('retombe sur le français pour une locale non prise en charge', () => {
    expect(getSystemBlueprints('de-DE')[0]?.language).toBe('fr-FR');
  });
});
