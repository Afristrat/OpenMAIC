import { createLogger } from '@/lib/logger';

const log = createLogger('ReservationOverrun');
const DEFAULT_ALERT_THRESHOLD = 3;
const overrunsByTenant = new Map<string, number>();

function alertThreshold(): number {
  const configured = Number(process.env.RESERVATION_OVERRUN_ALERT_THRESHOLD);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_ALERT_THRESHOLD;
}

/**
 * Compte chaque règlement plafonné à la quantité réservée, par tenant et par processus.
 * Au seuil, l'incident passe en erreur pour déclencher l'alerte : c'est le déclencheur de
 * réexamen de la décision d'accepter le plafonnement (voir llm-reservation.ts).
 */
export function recordReservationOverrun(
  tenantId: string,
  billableUnit: string,
  measuredQuantity: number,
  reservedQuantity: number,
): number {
  const count = (overrunsByTenant.get(tenantId) ?? 0) + 1;
  overrunsByTenant.set(tenantId, count);
  const detail = `tenant ${tenantId}, unité ${billableUnit}, mesuré ${measuredQuantity}, réservé ${reservedQuantity}, dépassement n° ${count}`;
  if (count >= alertThreshold()) {
    log.error(`ALERTE dépassements de réservation répétés : ${detail}`);
  } else {
    log.warn(`Dépassement de réservation, règlement plafonné : ${detail}`);
  }
  return count;
}

export function resetReservationOverruns(): void {
  overrunsByTenant.clear();
}
