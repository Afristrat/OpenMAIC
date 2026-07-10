/**
 * Skills Registry — Public API
 */

export type { Skill, SkillAgent, SkillPromptOverride, SkillClassroomTemplate, SkillCategory } from './types';
export { loadBuiltInSkills, getSkill, listSkills, getSkillAgents, getSkillTemplates, resetRegistry } from './registry';
export { loadSkillFromDir, loadAllSkills } from './loader';
