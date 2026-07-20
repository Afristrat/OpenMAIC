import { NextRequest, NextResponse } from 'next/server';
import { listSkills, getSkill } from '@/lib/skills/registry';
import { parseSkillManifest } from '@/lib/skills/manifest-schema';
import type { Skill } from '@/lib/skills/types';
import { requireSuperAdminOrOrgAdmin, requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const MAX_MANIFEST_BYTES = 256 * 1024;

function localise(value: string | Record<string, string>, locale: string): string {
  if (typeof value === 'string') return value;
  const language = locale.split('-')[0];
  return (
    value[locale] ??
    Object.entries(value).find(([key]) => key.startsWith(language))?.[1] ??
    Object.values(value)[0] ??
    ''
  );
}

function serializeSkill(skill: Skill, locale: string, source: 'system' | 'organization') {
  return {
    id: skill.id,
    name: localise(skill.name, locale),
    description: localise(skill.description, locale),
    category: skill.category,
    version: skill.version,
    author: skill.author,
    supportedLanguages: skill.supportedLanguages,
    agentCount: skill.agents.length,
    templateCount: skill.classroomTemplates.length,
    source,
    agents: skill.agents.map((agent) => {
      const persona = localise(agent.persona, locale);
      return {
        id: agent.id,
        name: localise(agent.name, locale),
        role: agent.role,
        avatar: agent.avatar,
        color: agent.color,
        personaPreview: `${persona.slice(0, 120)}${persona.length > 120 ? '...' : ''}`,
      };
    }),
    templates: skill.classroomTemplates.map((template) => ({
      id: template.id,
      name: localise(template.name, locale),
      description: localise(template.description, locale),
    })),
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const locale = req.nextUrl.searchParams.get('locale') ?? 'fr-FR';
  const orgId = req.nextUrl.searchParams.get('orgId');
  const skills = listSkills().map((skill) => serializeSkill(skill, locale, 'system'));

  if (!orgId) return NextResponse.json({ success: true, skills });
  const auth = await requireSuperAdminOrOrgMember(req, orgId);
  if (auth.response) return auth.response;

  const { data, error } = await createServiceSupabaseClient()
    .from('organization_skills')
    .select('manifest')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });
  if (error) {
    return NextResponse.json({ error: 'Failed to load organization skills' }, { status: 500 });
  }

  for (const row of data ?? []) {
    const parsed = parseSkillManifest(row.manifest);
    if (parsed.success) skills.push(serializeSkill(parsed.skill, locale, 'organization'));
  }
  return NextResponse.json({ success: true, skills });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_MANIFEST_BYTES) {
    return NextResponse.json({ error: 'Skill manifest exceeds 256 KB' }, { status: 413 });
  }

  let body: { orgId?: unknown; manifest?: unknown };
  try {
    body = (await req.json()) as { orgId?: unknown; manifest?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.orgId !== 'string') {
    return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
  }
  const auth = await requireSuperAdminOrOrgAdmin(req, body.orgId);
  if (auth.response) return auth.response;
  const serializedManifest = JSON.stringify(body.manifest);
  if (!serializedManifest) {
    return NextResponse.json({ error: 'manifest is required' }, { status: 400 });
  }
  if (Buffer.byteLength(serializedManifest, 'utf8') > MAX_MANIFEST_BYTES) {
    return NextResponse.json({ error: 'Skill manifest exceeds 256 KB' }, { status: 413 });
  }

  const parsed = parseSkillManifest(body.manifest);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid skill manifest', details: parsed.errors }, { status: 400 });
  }
  if (getSkill(parsed.skill.id)) {
    return NextResponse.json({ error: 'A system skill already uses this identifier' }, { status: 409 });
  }

  const { error } = await createServiceSupabaseClient().from('organization_skills').upsert(
    {
      org_id: body.orgId,
      skill_id: parsed.skill.id,
      manifest: parsed.skill as unknown as Record<string, unknown>,
      installed_by: auth.user.id,
    },
    { onConflict: 'org_id,skill_id' },
  );
  if (error) {
    return NextResponse.json({ error: 'Failed to install skill' }, { status: 500 });
  }
  return NextResponse.json({ success: true, skillId: parsed.skill.id }, { status: 201 });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const orgId = req.nextUrl.searchParams.get('orgId');
  const skillId = req.nextUrl.searchParams.get('skillId');
  if (!orgId || !skillId) {
    return NextResponse.json({ error: 'orgId and skillId are required' }, { status: 400 });
  }
  const auth = await requireSuperAdminOrOrgAdmin(req, orgId);
  if (auth.response) return auth.response;

  const { error } = await createServiceSupabaseClient()
    .from('organization_skills')
    .delete()
    .eq('org_id', orgId)
    .eq('skill_id', skillId);
  if (error) return NextResponse.json({ error: 'Failed to remove skill' }, { status: 500 });
  return NextResponse.json({ success: true });
}
