import type { PaymentStatus } from './types';

/**
 * Le statut d'un paiement ne régresse jamais : les notifications (IPN) sont rejouées ou arrivent
 * dans le désordre, et un `pending` ou `failed` tardif ne doit pas écraser un paiement `completed`.
 *
 * Ordre : pending < failed < completed < refunded. (`failed` puis `completed` reste possible : un
 * même identifiant de transaction peut échouer puis aboutir.)
 */
const PROTECTED_BY: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ['failed', 'completed', 'refunded'],
  failed: ['completed', 'refunded'],
  completed: ['refunded'],
  refunded: [],
};

/** Statuts déjà enregistrés qu'une notification `next` ne peut pas remplacer. */
export function statusesProtectedFrom(next: PaymentStatus): readonly PaymentStatus[] {
  return PROTECTED_BY[next] ?? [];
}
