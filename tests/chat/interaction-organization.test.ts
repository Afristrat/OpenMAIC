import { describe, expect, it } from 'vitest';
import { resolveInteractionOrganizationId } from '@/lib/chat/interaction-organization';

describe('chat interaction organization', () => {
  it('refuses a server-backed public classroom even when another organization is cached locally', () => {
    expect(resolveInteractionOrganizationId(null, 'cached-other-organization')).toBeNull();
  });

  it('uses the server-authorized organization for a classroom member', () => {
    expect(resolveInteractionOrganizationId('authorized-organization', null)).toBe(
      'authorized-organization',
    );
  });

  it('keeps the local organization fallback for an unsaved local classroom', () => {
    expect(resolveInteractionOrganizationId(undefined, 'current-organization')).toBe(
      'current-organization',
    );
  });
});
