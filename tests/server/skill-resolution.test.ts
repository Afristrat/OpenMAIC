import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Skill } from '@/lib/skills/types';

const mocks = vi.hoisted(() => ({
  getSkill: vi.fn(),
  registerSkill: vi.fn(),
  parseSkillManifest: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/lib/skills/registry', () => ({
  getSkill: mocks.getSkill,
  registerSkill: mocks.registerSkill,
}));

vi.mock('@/lib/skills/manifest-schema', () => ({
  parseSkillManifest: mocks.parseSkillManifest,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ single: mocks.single }),
        }),
      }),
    }),
  }),
}));

const tenantSkill = {
  id: 'marketing-practice',
  promptOverrides: [],
} as unknown as Skill;

describe('resolveOrganizationSkillId', () => {
  beforeEach(() => {
    mocks.getSkill.mockReset();
    mocks.registerSkill.mockReset();
    mocks.parseSkillManifest.mockReset();
    mocks.single.mockReset();
  });

  it('returns a built-in skill without querying tenant storage', async () => {
    mocks.getSkill.mockReturnValue(tenantSkill);
    const { resolveOrganizationSkillId } = await import('@/lib/server/skill-resolution');

    await expect(resolveOrganizationSkillId('org-a', 'formation-design-pro')).resolves.toBe(
      'formation-design-pro',
    );
    expect(mocks.single).not.toHaveBeenCalled();
  });

  it('reloads and canonically registers a persisted tenant skill', async () => {
    mocks.getSkill.mockReturnValue(undefined);
    mocks.single.mockResolvedValue({ data: { manifest: {} }, error: null });
    mocks.parseSkillManifest.mockReturnValue({ success: true, skill: tenantSkill });
    const { resolveOrganizationSkillId } = await import('@/lib/server/skill-resolution');

    await expect(
      resolveOrganizationSkillId('org-a', 'tenant:org-a:marketing-practice'),
    ).resolves.toBe('tenant:org-a:marketing-practice');
    expect(mocks.registerSkill).toHaveBeenCalledWith({
      ...tenantSkill,
      id: 'tenant:org-a:marketing-practice',
    });
  });

  it('rejects a tenant skill owned by another organization before registry lookup', async () => {
    const { resolveOrganizationSkillId } = await import('@/lib/server/skill-resolution');

    await expect(
      resolveOrganizationSkillId('org-a', 'tenant:org-b:marketing-practice'),
    ).rejects.toThrow('does not belong to organization');
    expect(mocks.getSkill).not.toHaveBeenCalled();
    expect(mocks.single).not.toHaveBeenCalled();
  });
});
