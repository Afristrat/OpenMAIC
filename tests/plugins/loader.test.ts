import { describe, expect, it } from 'vitest';
import { formatPluginsForPrompt, loadPlugins, readPluginHtml } from '@/lib/plugins/loader';
import { validatePluginData } from '@/lib/plugins/schema-validator';

describe('bundled scene plugins', () => {
  it('loads both production plugins and their iframe documents', () => {
    const pluginIds = loadPlugins()
      .map((plugin) => plugin.id)
      .sort();

    expect(pluginIds).toEqual(['code-sandbox', 'lab-simulation']);
    expect(readPluginHtml('code-sandbox')).toMatch(/<!doctype html>/i);
    expect(readPluginHtml('lab-simulation')).toMatch(/<!doctype html>/i);
    expect(formatPluginsForPrompt()).toContain('code-sandbox');
    expect(formatPluginsForPrompt()).toContain('lab-simulation');
  });

  it('validates generated data against the plug-in manifest schema', () => {
    const plugin = loadPlugins().find((candidate) => candidate.id === 'code-sandbox');
    expect(plugin).toBeDefined();
    if (!plugin) return;

    expect(
      validatePluginData(
        {
          language: 'javascript',
          title: 'Somme de deux nombres',
          instructions: 'Complétez la fonction.',
          starterCode: 'function sum(a, b) { /* TODO */ }',
          tests: [],
        },
        plugin.outputSchema,
      ),
    ).toEqual({ valid: true });

    expect(
      validatePluginData(
        {
          language: 'ruby',
          title: 'Exercice invalide',
          instructions: 'Test',
          tests: [],
        },
        plugin.outputSchema,
      ),
    ).toEqual({ valid: false, error: '$.starterCode is required' });
  });
});
