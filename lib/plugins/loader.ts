/**
 * Plugin Loader — discovers and loads scene plugins from the filesystem.
 *
 * Each plugin lives under `plugins/scenes/<id>/` with at minimum:
 *   - manifest.json  → ScenePlugin metadata
 *   - index.html     → iframe entry-point
 *   - prompt.md      → (optional) generation prompt override
 *
 * The loader reads manifests at startup (server-side), merges optional
 * prompt.md content, and registers every valid plugin.
 */

import fs from 'fs';
import path from 'path';
import type { ScenePlugin } from './scene-sdk';
import { registerPlugin, clearPluginRegistry, listPlugins } from './scene-sdk';
import { createLogger } from '@/lib/logger';

const log = createLogger('PluginLoader');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getPluginsDir(): string {
  return path.join(process.cwd(), 'plugins', 'scenes');
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Scan `plugins/scenes/` and register every valid plugin.
 * Returns the list of successfully loaded plugins.
 *
 * Safe to call multiple times — clears the registry first.
 */
export function loadPlugins(): ScenePlugin[] {
  clearPluginRegistry();

  const pluginsDir = getPluginsDir();

  if (!fs.existsSync(pluginsDir)) {
    log.info('No plugins directory found — skipping plugin loading.');
    return [];
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pluginDir = path.join(pluginsDir, entry.name);
    const manifestPath = path.join(pluginDir, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      log.warn(`Plugin "${entry.name}" has no manifest.json — skipping.`);
      continue;
    }

    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw) as ScenePlugin;

      // Validate required fields
      if (!manifest.id || !manifest.type || !manifest.renderUrl) {
        log.warn(`Plugin "${entry.name}" manifest is missing required fields — skipping.`);
        continue;
      }

      // Ensure id matches folder name
      if (manifest.id !== entry.name) {
        log.warn(
          `Plugin folder "${entry.name}" does not match manifest id "${manifest.id}" — using folder name.`,
        );
        manifest.id = entry.name;
      }

      // Merge optional prompt.md into systemPrompt
      const promptPath = path.join(pluginDir, 'prompt.md');
      if (fs.existsSync(promptPath)) {
        const promptContent = fs.readFileSync(promptPath, 'utf-8').trim();
        if (promptContent) {
          // prompt.md takes precedence; append manifest systemPrompt as fallback context
          manifest.systemPrompt = manifest.systemPrompt
            ? `${promptContent}\n\n---\n\n${manifest.systemPrompt}`
            : promptContent;
        }
      }

      // Verify index.html exists
      const htmlPath = path.join(pluginDir, manifest.renderUrl);
      if (!fs.existsSync(htmlPath)) {
        log.warn(`Plugin "${entry.name}" renderUrl "${manifest.renderUrl}" not found — skipping.`);
        continue;
      }

      registerPlugin(manifest);
      log.info(`Loaded plugin "${manifest.id}" (type: ${manifest.type}, v${manifest.version}).`);
    } catch (error) {
      log.error(`Failed to load plugin "${entry.name}":`, error);
    }
  }

  const loaded = listPlugins();
  log.info(`Plugin loading complete — ${loaded.length} plugin(s) registered.`);
  return loaded;
}

/**
 * Read the raw HTML content of a plugin's entry-point.
 * Returns null if the file cannot be read.
 */
export function readPluginHtml(pluginId: string): string | null {
  const pluginsDir = getPluginsDir();
  const manifestPath = path.join(pluginsDir, pluginId, 'manifest.json');

  if (!fs.existsSync(manifestPath)) return null;

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ScenePlugin;
    const htmlPath = path.join(pluginsDir, pluginId, manifest.renderUrl);
    return fs.readFileSync(htmlPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Get the public URL path for a plugin's assets.
 * Plugins are served from `/plugins/scenes/<id>/`.
 */
export function getPluginPublicPath(pluginId: string): string {
  return `/plugins/scenes/${pluginId}`;
}
