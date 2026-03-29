/**
 * Scene Plugin SDK — Scene Genome Protocol
 *
 * Defines the plugin interface for extending Qalem with custom scene types.
 * Each plugin lives in `plugins/scenes/<plugin-id>/` and declares its
 * capabilities via a manifest.json.
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/**
 * A scene plugin descriptor loaded from `manifest.json`.
 */
export interface ScenePlugin {
  /** Unique plugin identifier (must match the folder name). */
  id: string;

  /** Scene type key used in Scene.type — must be globally unique. */
  type: string;

  /** Human-readable name keyed by locale (fr, ar, en). */
  name: Record<string, string>;

  /** Short description keyed by locale. */
  description: Record<string, string>;

  /** Semver string. */
  version: string;

  /** Author name or organisation. */
  author: string;

  // -- Rendering ----------------------------------------------------------

  /**
   * Relative URL to the plugin's iframe entry-point (usually `index.html`).
   * Resolved against `plugins/scenes/<id>/`.
   */
  renderUrl: string;

  /** Preferred iframe width in px (optional, defaults to 100 %). */
  width?: number;

  /** Preferred iframe height in px (optional, defaults to 100 %). */
  height?: number;

  // -- Generation ---------------------------------------------------------

  /**
   * System prompt used when the LLM generates content for this scene type.
   * May also be loaded from an adjacent `prompt.md` — the loader merges both.
   */
  systemPrompt: string;

  /** JSON Schema describing the shape of the generated content payload. */
  outputSchema: Record<string, unknown>;

  // -- Actions (optional) -------------------------------------------------

  /** Action types this plugin can handle (e.g. "run-code", "reset"). */
  supportedActions?: string[];

  // -- Icon (optional) ----------------------------------------------------

  /**
   * Lucide icon name for the sidebar thumbnail.
   * Falls back to "Puzzle" if not set.
   */
  icon?: string;
}

// ---------------------------------------------------------------------------
// Plugin content type — stored in Scene.content
// ---------------------------------------------------------------------------

/**
 * Content payload for a plugin-based scene.
 * The `data` field conforms to the plugin's `outputSchema`.
 */
export interface PluginSceneContent {
  type: 'plugin';
  /** The plugin type key (e.g. "code-sandbox", "lab-simulation"). */
  pluginType: string;
  /** Arbitrary payload conforming to the plugin's outputSchema. */
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Registry — singleton in-memory store
// ---------------------------------------------------------------------------

const registry = new Map<string, ScenePlugin>();

/**
 * Register a plugin in the runtime registry.
 * Silently replaces an existing entry with the same type.
 */
export function registerPlugin(plugin: ScenePlugin): void {
  registry.set(plugin.type, plugin);
}

/**
 * Look up a plugin by its scene type key.
 */
export function getPlugin(type: string): ScenePlugin | null {
  return registry.get(type) ?? null;
}

/**
 * Return all registered plugins as an array.
 */
export function listPlugins(): ScenePlugin[] {
  return Array.from(registry.values());
}

/**
 * Remove all entries (useful for tests / hot-reload).
 */
export function clearPluginRegistry(): void {
  registry.clear();
}

/**
 * Check whether a scene type is handled by a plugin.
 */
export function isPluginSceneType(type: string): boolean {
  return registry.has(type);
}
