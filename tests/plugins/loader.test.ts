import { describe, expect, it } from 'vitest';
import { formatPluginsForPrompt, loadPlugins, readPluginHtml } from '@/lib/plugins/loader';
import { validatePluginData } from '@/lib/plugins/schema-validator';

describe('bundled scene plugins', () => {
  it('loads every production plugin and its iframe document', () => {
    const plugins = loadPlugins();
    const pluginIds = plugins.map((plugin) => plugin.id).sort();

    expect(pluginIds).toEqual([
      'cash-flow-simulator',
      'code-sandbox',
      'controlled-spreadsheet',
      'credit-decision-lab',
      'decision-tree-lab',
      'industrial-process-simulator',
      'kpi-dashboard',
      'lab-simulation',
      'marketing-funnel-builder',
      'use-of-funds-allocator',
    ]);
    expect(readPluginHtml('code-sandbox')).toMatch(/<!doctype html>/i);
    const labSimulationHtml = readPluginHtml('lab-simulation');
    expect(labSimulationHtml).toMatch(/<!doctype html>/i);
    expect(labSimulationHtml).toContain(
      "import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';",
    );
    expect(labSimulationHtml).not.toContain('cannon-es.cjs.js');
    expect(formatPluginsForPrompt()).toContain('code-sandbox');
    expect(formatPluginsForPrompt()).toContain('lab-simulation');

    for (const pluginId of pluginIds.filter(
      (pluginId) => !['code-sandbox', 'lab-simulation'].includes(pluginId),
    )) {
      expect(readPluginHtml(pluginId)).toContain('/plugin-runtime/business-simulator.js');
      expect(plugins.find((plugin) => plugin.id === pluginId)?.demoData).toBeDefined();
      expect(formatPluginsForPrompt()).toContain(pluginId);
    }
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
