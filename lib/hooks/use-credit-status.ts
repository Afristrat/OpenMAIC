'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreditStatusView } from '@/lib/billing/credit-status-view';

/** Solde et état de blocage du tenant ; null tant que la lecture n'a pas abouti (jamais un blocage supposé). */
export function useCreditStatus(orgId: string | undefined): {
  status: CreditStatusView | null;
  refreshing: boolean;
  refresh: () => Promise<CreditStatusView | null>;
} {
  const [state, setState] = useState<{ orgId?: string; status: CreditStatusView | null }>({
    status: null,
  });
  const [refreshing, setRefreshing] = useState(false);
  const latestOrgId = useRef(orgId);
  latestOrgId.current = orgId;

  const refresh = useCallback(async (): Promise<CreditStatusView | null> => {
    if (!orgId) return null;
    setRefreshing(true);
    try {
      const response = await fetch(
        `/api/billing/credits?orgId=${encodeURIComponent(orgId)}&view=status`,
      );
      const data = await response.json();
      if (!response.ok || !data.success || !data.status) return null;
      const view: CreditStatusView = { balanceCredits: data.balanceCredits, ...data.status };
      // Une réponse tardive d'une autre organisation ne doit pas écraser l'état courant.
      if (latestOrgId.current === orgId) setState({ orgId, status: view });
      return view;
    } catch {
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status: state.orgId === orgId ? state.status : null, refreshing, refresh };
}
