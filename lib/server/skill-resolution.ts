import { getSkill, registerSkill } from '@/lib/skills/registry';
import { parseSkillManifest } from '@/lib/skills/manifest-schema';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

/**
 * Resolve a built-in or organization-installed skill into the canonical ID
 * used by the in-process prompt registry. Tenant manifests are reloaded on
 * demand so live chat does not depend on the generation worker's memory.
 */
export async function resolveOrganizationSkillId(
  orgId: string,
  requestedSkillId: string,
): Promise<string> {
  const tenantPrefix = `tenant:${orgId}:`;
  if (requestedSkillId.startsWith('tenant:') && !requestedSkillId.startsWith(tenantPrefix)) {
    throw new Error(`Skill "${requestedSkillId}" does not belong to organization "${orgId}"`);
  }
  if (getSkill(requestedSkillId)) return requestedSkillId;
  const storedSkillId = requestedSkillId.startsWith(tenantPrefix)
    ? requestedSkillId.slice(tenantPrefix.length)
    : requestedSkillId;

  const { data: organizationSkill, error } = await createServiceSupabaseClient()
    .from('organization_skills')
    .select('manifest')
    .eq('org_id', orgId)
    .eq('skill_id', storedSkillId)
    .single();
  if (error || !organizationSkill) {
    throw new Error(`Skill "${storedSkillId}" is not installed for this organization`);
  }

  const parsed = parseSkillManifest(organizationSkill.manifest);
  if (!parsed.success || parsed.skill.id !== storedSkillId) {
    throw new Error(`Installed skill "${storedSkillId}" has an invalid manifest`);
  }

  const canonicalId = `${tenantPrefix}${parsed.skill.id}`;
  registerSkill({ ...parsed.skill, id: canonicalId });
  return canonicalId;
}
