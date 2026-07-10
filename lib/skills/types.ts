/**
 * Skills Registry Types
 *
 * Defines the structure for pluggable skill packs that provide
 * pre-configured agents, prompt overrides, and classroom templates
 * for specific pedagogical domains.
 */

/** Skill category — determines UI grouping and filtering */
export type SkillCategory = 'pedagogy' | 'domain' | 'interaction' | 'assessment';

/**
 * SkillAgent — A pre-configured agent profile bundled with a skill.
 * Names and personas are i18n maps keyed by locale (e.g. 'fr-FR', 'ar-MA', 'en-US').
 */
export interface SkillAgent {
  id: string;
  name: Record<string, string>; // i18n: { 'fr-FR': 'Dr. Expert', 'en-US': 'Dr. Expert' }
  role: string; // 'teacher' | 'student' | 'assistant'
  persona: Record<string, string>; // i18n personas (full system prompt per locale)
  avatar: string; // Emoji or image URL
  color: string; // UI theme color (hex)
  priority: number; // Priority for director selection (1-10)
  allowedActions: string[];
}

/**
 * SkillPromptOverride — Customises an existing prompt template
 * when this skill is active.
 */
export interface SkillPromptOverride {
  promptId: string; // e.g. 'quiz-content'
  systemPromptAppend: string; // Appended to the system prompt
  variables: Record<string, string>; // Additional template variables
}

/**
 * SkillClassroomTemplate — A ready-to-use classroom configuration
 * that pre-fills the generation form.
 */
export interface SkillClassroomTemplate {
  id: string;
  name: Record<string, string>; // i18n
  description: Record<string, string>; // i18n
  requirement: string; // Pre-filled requirement text
  agentIds: string[]; // References to SkillAgent.id within the same skill
  language: string; // Default language for this template
}

/**
 * Skill — Top-level manifest describing a complete skill pack.
 */
export interface Skill {
  id: string;
  name: string; // i18n key or plain text
  description: string;
  category: SkillCategory;
  version: string;
  author: string;

  // What the skill provides
  agents: SkillAgent[];
  promptOverrides: SkillPromptOverride[];
  classroomTemplates: SkillClassroomTemplate[];
  sceneDefaults: Record<string, unknown>;

  // Requirements
  requiredProviders: string[]; // e.g. ['openai-tts', 'elevenlabs-tts']
  supportedLanguages: string[]; // e.g. ['fr-FR', 'ar-MA', 'en-US']
}
