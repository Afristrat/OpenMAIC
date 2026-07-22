import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function reserveCasting({
  userId,
  courseId,
  lineup,
  lineupHash,
}: {
  userId: string;
  courseId: string;
  lineup: Record<string, unknown>[];
  lineupHash: string;
}): Promise<{ id: string } | null> {
  const { data, error } = await createServiceSupabaseClient()
    .from('castings')
    .insert({ user_id: userId, course_id: courseId, lineup, lineup_hash: lineupHash })
    .select('id')
    .single();

  if (error?.code === '23505') return null;
  if (error) throw new Error(`Failed to reserve classroom casting: ${error.message}`);
  if (!data) throw new Error('Casting reservation did not return an identifier');
  return data;
}

export async function releaseCastingReservation(id: string): Promise<void> {
  const { error } = await createServiceSupabaseClient().from('castings').delete().eq('id', id);
  if (error) throw new Error(`Failed to release classroom casting reservation: ${error.message}`);
}
