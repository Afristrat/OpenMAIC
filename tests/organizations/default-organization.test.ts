import { describe, expect, it } from 'vitest';
import { pickDefaultOrganization } from '@/lib/organizations/default-organization';

const org = (id: string, created_at: string, isDirectMember: boolean) => ({
  id,
  created_at,
  isDirectMember,
});

// The order the API gives a super-administrator: newest tenant first.
const newestFirst = [
  org('formation', '2026-10-24T17:00:00Z', true),
  org('nokesa', '2026-10-24T14:53:00Z', false),
  org('demo', '2026-07-14T16:00:00Z', true),
];

describe('pickDefaultOrganization', () => {
  it('lands on the oldest direct membership, not on the newest tenant listed first', () => {
    expect(
      pickDefaultOrganization(newestFirst, { savedOrganizationId: null, testedTenantId: null })?.id,
    ).toBe('demo');
  });

  it('does not depend on the order of the list', () => {
    const reversed = [...newestFirst].reverse();
    expect(
      pickDefaultOrganization(reversed, { savedOrganizationId: null, testedTenantId: null })?.id,
    ).toBe('demo');
  });

  it('keeps a remembered choice while the user is still a direct member', () => {
    expect(
      pickDefaultOrganization(newestFirst, {
        savedOrganizationId: 'formation',
        testedTenantId: null,
      })?.id,
    ).toBe('formation');
  });

  it('ignores a remembered tenant the user only administers, unless it is being tested', () => {
    const context = { savedOrganizationId: 'nokesa', testedTenantId: null };
    expect(pickDefaultOrganization(newestFirst, context)?.id).toBe('demo');
    expect(pickDefaultOrganization(newestFirst, { ...context, testedTenantId: 'nokesa' })?.id).toBe(
      'nokesa',
    );
  });

  it('falls back to the first organization when the user has no direct membership', () => {
    const none = [org('a', '2026-01-01T00:00:00Z', false), org('b', '2026-02-01T00:00:00Z', false)];
    expect(
      pickDefaultOrganization(none, { savedOrganizationId: null, testedTenantId: null })?.id,
    ).toBe('a');
  });

  it('returns null for a user without any organization', () => {
    expect(pickDefaultOrganization([], { savedOrganizationId: null, testedTenantId: null })).toBe(
      null,
    );
  });
});
