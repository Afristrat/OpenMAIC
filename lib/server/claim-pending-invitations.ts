import { createLogger } from '@/lib/logger';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const log = createLogger('ClaimPendingInvitations');

interface InvitedUser {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}

/**
 * Rattache un compte existant aux organisations qui l'ont invité. Une invitation n'était
 * consommée que par l'ouverture de son lien : un invité déjà inscrit qui se connectait
 * directement ne voyait jamais l'organisation. L'adresse du compte doit être vérifiée : c'est elle
 * qui prouve que l'invitation lui était destinée. Une invitation qui échoue n'empêche ni les
 * autres ni la connexion.
 */
export async function claimPendingInvitations(user: InvitedUser): Promise<number> {
  const email = user.email?.trim().toLowerCase();
  if (!email || !user.email_confirmed_at) return 0;

  const service = createServiceSupabaseClient();
  const { data: pending, error } = await service
    .from('org_invitations')
    .select('token')
    .eq('email', email)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString());
  if (error || !pending || pending.length === 0) return 0;

  let claimed = 0;
  for (const invitation of pending) {
    const { error: claimError } = await service
      .rpc('claim_invitation_for_existing_user', {
        invitation_token: invitation.token,
        invited_user_id: user.id,
        invited_email: email,
      })
      .single();
    if (claimError) {
      log.warn('Pending invitation could not be claimed', claimError.message);
      continue;
    }
    claimed += 1;
  }
  return claimed;
}
