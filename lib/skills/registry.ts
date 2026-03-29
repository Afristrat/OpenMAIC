/**
 * Skills Registry
 *
 * Central registry for managing loaded skills.
 * Provides lookup, listing, and locale-aware accessors
 * for skill agents and classroom templates.
 */

import type { Skill, SkillAgent, SkillClassroomTemplate } from './types';
import { loadAllSkills } from './loader';
import { createLogger } from '@/lib/logger';

const log = createLogger('SkillRegistry');

/** Internal skill store keyed by skill ID */
const skillMap = new Map<string, Skill>();

/** Whether built-in skills have been loaded */
let initialized = false;

/**
 * Load all built-in skills from the `skills/` directory.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function loadBuiltInSkills(): void {
  if (initialized) return;

  const skills = loadAllSkills();
  for (const skill of skills) {
    if (skillMap.has(skill.id)) {
      log.warn(`Duplicate skill ID "${skill.id}" — skipping`);
      continue;
    }
    skillMap.set(skill.id, skill);
  }

  initialized = true;
  log.info(`Registry initialized with ${skillMap.size} skill(s)`);
}

/**
 * Get a skill by its ID.
 * Initializes the registry on first call if needed.
 */
export function getSkill(id: string): Skill | undefined {
  ensureInitialized();
  return skillMap.get(id);
}

/**
 * List all available skills.
 */
export function listSkills(): Skill[] {
  ensureInitialized();
  return Array.from(skillMap.values());
}

/**
 * Localise a single i18n record, falling back through locale variants
 * then to the first available value.
 */
function localise(record: Record<string, string>, locale: string): string {
  // Exact match
  if (record[locale]) return record[locale];

  // Language-only fallback (e.g. 'fr' from 'fr-FR')
  const lang = locale.split('-')[0];
  const langMatch = Object.entries(record).find(([key]) => key.startsWith(lang));
  if (langMatch) return langMatch[1];

  // Return first available value
  const values = Object.values(record);
  return values[0] ?? '';
}

/**
 * Get agents for a skill, with names and personas resolved to a specific locale.
 */
export function getSkillAgents(
  skillId: string,
  locale: string,
): Array<SkillAgent & { localizedName: string; localizedPersona: string }> {
  const skill = getSkill(skillId);
  if (!skill) return [];

  return skill.agents.map((agent) => ({
    ...agent,
    localizedName: localise(agent.name, locale),
    localizedPersona: localise(agent.persona, locale),
  }));
}

/**
 * Get classroom templates for a skill, with names and descriptions resolved to a specific locale.
 */
export function getSkillTemplates(
  skillId: string,
  locale: string,
): Array<SkillClassroomTemplate & { localizedName: string; localizedDescription: string }> {
  const skill = getSkill(skillId);
  if (!skill) return [];

  return skill.classroomTemplates.map((template) => ({
    ...template,
    localizedName: localise(template.name, locale),
    localizedDescription: localise(template.description, locale),
  }));
}

/**
 * Reset the registry (useful for testing).
 */
export function resetRegistry(): void {
  skillMap.clear();
  initialized = false;
}

// ── Internal ────────────────────────────────────────────────────────

function ensureInitialized(): void {
  if (!initialized) {
    loadBuiltInSkills();
  }
}
