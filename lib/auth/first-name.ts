import type { User } from '@supabase/supabase-js';

/**
 * Prénom de la personne connectée, lu dans les métadonnées du compte
 * (given_name, first_name, puis premier mot de full_name ou name), à défaut
 * dans le préfixe de son adresse. Chaîne vide sans compte : on n'invente rien.
 */
export function authenticatedFirstName(user: User | null | undefined): string {
  if (!user) return '';
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const candidate = [metadata.given_name, metadata.first_name, metadata.full_name, metadata.name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim();
  if (candidate) return candidate.split(/\s+/)[0] ?? candidate;
  const emailPrefix = user.email?.split('@')[0]?.trim();
  return emailPrefix ? (emailPrefix.split(/[._-]+/)[0] ?? emailPrefix) : '';
}

/**
 * Profil transmis au chat en direct : le pseudonyme local prime, sinon le
 * prénom du compte, pour que le formateur puisse nommer l'auteur d'une
 * intervention. Le pseudonyme local est vide par défaut et n'est jamais
 * rechargé depuis le compte, d'où ce repli.
 */
export function buildChatUserProfile(
  profile: { nickname?: string; bio?: string },
  user: User | null | undefined,
): { nickname?: string; bio?: string } {
  return {
    nickname: profile.nickname?.trim() || authenticatedFirstName(user) || undefined,
    bio: profile.bio || undefined,
  };
}
