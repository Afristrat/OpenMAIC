/**
 * Skill Loader
 *
 * Loads skill manifests from the `skills/{skill-id}/manifest.json` directory.
 * Validates the manifest structure, loads referenced prompt files,
 * and returns a fully hydrated Skill object.
 */

import fs from 'fs';
import path from 'path';
import type { Skill, SkillAgent, SkillClassroomTemplate, SkillPromptOverride } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('SkillLoader');

/**
 * Get the root skills directory path.
 */
function getSkillsDir(): string {
  return path.join(process.cwd(), 'skills');
}

/**
 * Validate that a parsed object has the required Skill fields.
 * Returns an array of validation errors (empty = valid).
 */
function validateManifest(data: unknown): string[] {
  const errors: string[] = [];
  if (typeof data !== 'object' || data === null) {
    return ['Manifest must be a JSON object'];
  }

  const obj = data as Record<string, unknown>;

  // Required string fields
  const requiredStrings = ['id', 'name', 'description', 'category', 'version', 'author'];
  for (const field of requiredStrings) {
    if (typeof obj[field] !== 'string' || (obj[field] as string).length === 0) {
      errors.push(`Missing or invalid required field: ${field}`);
    }
  }

  // Category validation
  const validCategories = ['pedagogy', 'domain', 'interaction', 'assessment'];
  if (typeof obj['category'] === 'string' && !validCategories.includes(obj['category'])) {
    errors.push(`Invalid category "${obj['category']}". Must be one of: ${validCategories.join(', ')}`);
  }

  // Required arrays
  if (!Array.isArray(obj['agents'])) {
    errors.push('Missing or invalid field: agents (must be an array)');
  }
  if (!Array.isArray(obj['promptOverrides'])) {
    errors.push('Missing or invalid field: promptOverrides (must be an array)');
  }
  if (!Array.isArray(obj['classroomTemplates'])) {
    errors.push('Missing or invalid field: classroomTemplates (must be an array)');
  }
  if (!Array.isArray(obj['requiredProviders'])) {
    errors.push('Missing or invalid field: requiredProviders (must be an array)');
  }
  if (!Array.isArray(obj['supportedLanguages'])) {
    errors.push('Missing or invalid field: supportedLanguages (must be an array)');
  }

  // sceneDefaults must be an object
  if (typeof obj['sceneDefaults'] !== 'object' || obj['sceneDefaults'] === null || Array.isArray(obj['sceneDefaults'])) {
    errors.push('Missing or invalid field: sceneDefaults (must be an object)');
  }

  return errors;
}

/**
 * Load a single skill from its directory.
 * Reads manifest.json, validates it, and loads any referenced prompt files.
 */
export function loadSkillFromDir(skillDir: string): Skill | null {
  const manifestPath = path.join(skillDir, 'manifest.json');

  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const data: unknown = JSON.parse(raw);

    const errors = validateManifest(data);
    if (errors.length > 0) {
      log.error(`Invalid skill manifest at ${manifestPath}:`, errors.join('; '));
      return null;
    }

    const manifest = data as Record<string, unknown>;

    // Load external prompt files referenced in promptOverrides
    const promptOverrides = (manifest['promptOverrides'] as SkillPromptOverride[]).map((override) => {
      // If systemPromptAppend references a file path (starts with "file:"), load it
      if (override.systemPromptAppend.startsWith('file:')) {
        const relativePath = override.systemPromptAppend.slice(5);
        const resolved = path.resolve(skillDir, relativePath);
        if (!resolved.startsWith(path.resolve(skillDir))) {
          log.warn(`Path traversal attempt blocked in skill ${manifest['id']}`);
          return override;
        }
        const filePath = resolved;
        try {
          return {
            ...override,
            systemPromptAppend: fs.readFileSync(filePath, 'utf-8').trim(),
          };
        } catch {
          log.warn(`Could not load prompt file ${filePath} for override ${override.promptId}`);
          return override;
        }
      }
      return override;
    });

    const skill: Skill = {
      id: manifest['id'] as string,
      name: manifest['name'] as string,
      description: manifest['description'] as string,
      category: manifest['category'] as Skill['category'],
      version: manifest['version'] as string,
      author: manifest['author'] as string,
      agents: manifest['agents'] as SkillAgent[],
      promptOverrides,
      classroomTemplates: manifest['classroomTemplates'] as SkillClassroomTemplate[],
      sceneDefaults: manifest['sceneDefaults'] as Record<string, unknown>,
      requiredProviders: manifest['requiredProviders'] as string[],
      supportedLanguages: manifest['supportedLanguages'] as string[],
    };

    log.info(`Loaded skill: ${skill.id} v${skill.version}`);
    return skill;
  } catch (error) {
    log.error(`Failed to load skill from ${skillDir}:`, error);
    return null;
  }
}

/**
 * Discover and load all skills from the skills root directory.
 * Each subdirectory containing a manifest.json is treated as a skill.
 */
export function loadAllSkills(): Skill[] {
  const skillsDir = getSkillsDir();
  const skills: Skill[] = [];

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(skillsDir, entry.name);
      const skill = loadSkillFromDir(skillDir);
      if (skill) {
        skills.push(skill);
      }
    }
  } catch (error) {
    log.error('Failed to read skills directory:', error);
  }

  return skills;
}
