import { createServiceSupabaseClient } from '@/lib/supabase/service';

export type NotificationDeliverySource = 'anchor_delivery' | 'review_notification';

/**
 * Atomically reserves one learner-visible solicitation. The reservation is
 * deliberately retained across a bounded provider retry: attempts, accepted
 * deliveries and physical reception are distinct facts, and retries must not
 * turn a temporary provider failure into a notification burst.
 */
export async function claimNotificationDeliverySlot(input: {
  userId: string;
  source: NotificationDeliverySource;
  sourceId: string;
  targetTime?: Date;
}): Promise<boolean> {
  const targetTime = input.targetTime ?? new Date();
  const service = createServiceSupabaseClient();
  const { data, error } = await service.rpc('claim_notification_delivery_slot', {
    target_user_id: input.userId,
    target_source: input.source,
    target_source_id: input.sourceId,
    target_time: targetTime.toISOString(),
  });
  if (error) throw new Error(`Notification delivery policy claim failed: ${error.message}`);
  return data === true;
}
