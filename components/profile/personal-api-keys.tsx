'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

type Provider = { id: string; name: string };
type SavedKey = { providerId: string; hint: string; updatedAt: string };
type Notice = { kind: 'ok' | 'error'; text: string };

type KeysResponse = { success: boolean; providers?: Provider[]; keys?: SavedKey[] };

async function fetchKeys(): Promise<{ providers: Provider[]; keys: SavedKey[] } | null> {
  try {
    const response = await fetch('/api/account/api-keys', { cache: 'no-store' });
    const body: KeysResponse = await response.json();
    if (!response.ok || !body.success) return null;
    return { providers: body.providers ?? [], keys: body.keys ?? [] };
  } catch {
    return null;
  }
}

/**
 * Clés d'API personnelles : la personne utilise son propre compte chez un fournisseur de modèles.
 * La clé part chiffrée au serveur et n'est jamais relue : l'écran n'affiche que les quatre
 * derniers caractères. Avec une clé enregistrée, les appels à ce fournisseur ne consomment aucun
 * crédit de la plateforme.
 */
export function PersonalApiKeys(): React.ReactElement {
  const { t } = useI18n();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [keys, setKeys] = useState<SavedKey[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [providerId, setProviderId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchKeys().then((state) => {
      if (cancelled) return;
      if (state) {
        setProviders(state.providers);
        setKeys(state.keys);
        setProviderId((current) => current || state.providers[0]?.id || '');
      } else {
        setFailed(true);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    const state = await fetchKeys();
    if (state) setKeys(state.keys);
  }, []);

  const save = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy || !providerId || !apiKey.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/account/api-keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, apiKey }),
      });
      if (response.ok) {
        setApiKey('');
        setNotice({ kind: 'ok', text: t('apiKeys.saved') });
        await refresh();
      } else {
        const text =
          response.status === 422
            ? t('apiKeys.rejected')
            : response.status === 502
              ? t('apiKeys.unavailable')
              : response.status === 400
                ? t('apiKeys.invalid')
                : t('apiKeys.saveError');
        setNotice({ kind: 'error', text });
      }
    } catch {
      setNotice({ kind: 'error', text: t('apiKeys.saveError') });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/account/api-keys?providerId=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setNotice({ kind: 'ok', text: t('apiKeys.removed') });
        await refresh();
      } else {
        setNotice({ kind: 'error', text: t('apiKeys.removeError') });
      }
    } catch {
      setNotice({ kind: 'error', text: t('apiKeys.removeError') });
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id: string): string => providers.find((p) => p.id === id)?.name ?? id;

  return (
    <section aria-labelledby="api-keys-title" className="space-y-3">
      <h2 id="api-keys-title" className="flex items-center gap-2 text-lg font-medium">
        <KeyRound className="size-5" aria-hidden="true" />
        {t('apiKeys.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('apiKeys.lead')}</p>

      {!loaded ? (
        <Loader2 className="size-4 animate-spin" aria-label={t('apiKeys.loading')} />
      ) : failed ? (
        <p role="alert" className="text-sm text-destructive">
          {t('apiKeys.loadError')}
        </p>
      ) : (
        <>
          {keys.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {keys.map((key) => (
                <li key={key.providerId} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{nameOf(key.providerId)}</span>
                    <span className="ms-2 text-muted-foreground" dir="ltr">
                      {t('apiKeys.endsWith', { hint: key.hint })}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(key.providerId)}
                    disabled={busy}
                    className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    {t('apiKeys.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={(event) => void save(event)} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span>{t('apiKeys.provider')}</span>
              <select
                value={providerId}
                onChange={(event) => setProviderId(event.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2"
              >
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
              <span>{t('apiKeys.key')}</span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                dir="ltr"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={t('apiKeys.keyPlaceholder')}
                className="h-9 rounded-md border border-border bg-background px-2"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !apiKey.trim()}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-purple-600 px-4 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {t('apiKeys.save')}
            </button>
          </form>
          <p className="text-xs text-muted-foreground">{t('apiKeys.privacy')}</p>
          {notice && (
            <p
              role="status"
              className={
                notice.kind === 'ok'
                  ? 'flex items-center gap-2 text-sm text-green-700 dark:text-green-300'
                  : 'text-sm text-destructive'
              }
            >
              {notice.kind === 'ok' && <CheckCircle2 className="size-4 shrink-0" aria-hidden />}
              {notice.text}
            </p>
          )}
        </>
      )}
    </section>
  );
}
