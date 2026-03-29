import { NextRequest, NextResponse } from 'next/server';
import { listSkills, getSkillAgents, getSkillTemplates } from '@/lib/skills/registry';

/**
 * GET /api/skills?locale=fr-FR
 *
 * Returns all registered skills with their agents and templates,
 * localized to the requested locale.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const locale = req.nextUrl.searchParams.get('locale') ?? 'fr-FR';

  const skills = listSkills();

  const data = skills.map((skill) => {
    const agents = getSkillAgents(skill.id, locale);
    const templates = getSkillTemplates(skill.id, locale);

    // Resolve localized name/description for skills that use i18n objects
    const name =
      typeof skill.name === 'object'
        ? (skill.name as unknown as Record<string, string>)[locale] ??
          Object.values(skill.name as unknown as Record<string, string>)[0] ??
          skill.id
        : skill.name;

    const description =
      typeof skill.description === 'object'
        ? (skill.description as unknown as Record<string, string>)[locale] ??
          Object.values(skill.description as unknown as Record<string, string>)[0] ??
          ''
        : skill.description;

    return {
      id: skill.id,
      name,
      description,
      category: skill.category,
      version: skill.version,
      author: skill.author,
      supportedLanguages: skill.supportedLanguages,
      agentCount: skill.agents.length,
      templateCount: skill.classroomTemplates.length,
      agents: agents.map((a) => ({
        id: a.id,
        name: a.localizedName,
        role: a.role,
        avatar: a.avatar,
        color: a.color,
        personaPreview: a.localizedPersona.slice(0, 120) + (a.localizedPersona.length > 120 ? '...' : ''),
      })),
      templates: templates.map((t) => ({
        id: t.id,
        name: t.localizedName,
        description: t.localizedDescription,
      })),
    };
  });

  return NextResponse.json({ success: true, skills: data });
}
