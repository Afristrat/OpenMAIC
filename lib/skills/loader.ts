/**
 * Skill Loader
 *
 * Loads skill manifests from the `skills/{skill-id}/manifest.json` directory.
 * Validates the manifest structure, loads referenced prompt files,
 * and returns a fully hydrated Skill object.
 */

import fs from 'fs';
import path from 'path';
import type { Skill } from './types';
import { parseSkillManifest } from './manifest-schema';
import { createLogger } from '@/lib/logger';

const log = createLogger('SkillLoader');

/**
 * Get the root skills directory path.
 */
function getSkillsDir(): string {
  return path.join(process.cwd(), 'skills');
}

function isWithin(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== '..' &&
      !path.isAbsolute(relativePath))
  );
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
    const parsed = parseSkillManifest(data, { allowFileReferences: true });
    if (!parsed.success) {
      log.error(`Invalid skill manifest at ${manifestPath}:`, parsed.errors.join('; '));
      return null;
    }
    const manifest = parsed.skill;
    const skillRoot = path.resolve(skillDir);

    // Load external prompt files referenced in promptOverrides
    const promptOverrides = manifest.promptOverrides.map((override) => {
      // If systemPromptAppend references a file path (starts with "file:"), load it
      if (override.systemPromptAppend.startsWith('file:')) {
        const relativePath = override.systemPromptAppend.slice(5);
        const resolved = path.resolve(skillDir, relativePath);
        if (!isWithin(skillRoot, resolved)) {
          log.warn(`Path traversal attempt blocked in skill ${manifest.id}`);
          return override;
        }
        try {
          const stat = fs.lstatSync(resolved);
          if (stat.isSymbolicLink() || !stat.isFile()) {
            log.warn(`Prompt override is not a regular file: ${resolved}`);
            return override;
          }
          return {
            ...override,
            systemPromptAppend: fs.readFileSync(resolved, 'utf-8').trim(),
          };
        } catch {
          log.warn(`Could not load prompt file ${resolved} for override ${override.promptId}`);
          return override;
        }
      }
      return override;
    });

    const skill: Skill = {
      ...manifest,
      promptOverrides,
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
      if (!fs.existsSync(path.join(skillDir, 'manifest.json'))) continue;
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
