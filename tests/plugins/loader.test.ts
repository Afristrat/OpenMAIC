import { describe, expect, it } from 'vitest';
import { loadPlugins, readPluginHtml } from '@/lib/plugins/loader';

describe('bundled scene plugins', () => {
  it('loads both production plugins and their iframe documents', () => {
    const pluginIds = loadPlugins()
      .map((plugin) => plugin.id)
      .sort();

    expect(pluginIds).toEqual(['code-sandbox', 'lab-simulation']);
    expect(readPluginHtml('code-sandbox')).toMatch(/<!doctype html>/i);
    expect(readPluginHtml('lab-simulation')).toMatch(/<!doctype html>/i);
  });
});
