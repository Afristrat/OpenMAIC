/**
 * Le profil envoyé au chat se rabat sur le prénom du compte quand le
 * pseudonyme local est vide (cas par défaut), comme la création de formation.
 */
import { describe, it, expect } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { authenticatedFirstName, buildChatUserProfile } from '@/lib/auth/first-name';

const account = (metadata: Record<string, unknown>, email = 'a.mansouri@example.test') =>
  ({ id: 'u1', email, user_metadata: metadata }) as unknown as User;

describe('buildChatUserProfile', () => {
  it('pseudonyme vide et compte « Amine Mansouri » : le chat reçoit nickname Amine', () => {
    const profile = buildChatUserProfile(
      { nickname: '', bio: '' },
      account({ full_name: 'Amine Mansouri' }),
    );
    expect(profile.nickname).toBe('Amine');
    expect(profile.bio).toBeUndefined();
  });

  it('un pseudonyme choisi reste prioritaire sur le prénom du compte', () => {
    const profile = buildChatUserProfile(
      { nickname: 'Mino', bio: 'Consultant' },
      account({ given_name: 'Amine' }),
    );
    expect(profile).toEqual({ nickname: 'Mino', bio: 'Consultant' });
  });

  it('sans compte ni pseudonyme, aucun prénom n’est inventé', () => {
    expect(buildChatUserProfile({ nickname: '', bio: '' }, null).nickname).toBeUndefined();
  });
});

describe('authenticatedFirstName', () => {
  it('se rabat sur le préfixe de l’adresse quand le compte n’a pas de nom', () => {
    expect(authenticatedFirstName(account({}, 'amine.mansouri@example.test'))).toBe('amine');
  });
});
