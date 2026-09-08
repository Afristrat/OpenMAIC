'use client';

import { useEffect, useId, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';

const resource = z.object({ id: z.uuid(), resource_link_id: z.string(), stage_id: z.string() });
const user = z.object({ id: z.uuid(), lms_subject: z.string(), user_id: z.uuid() });
type Binding = { id: string; source: string; target: string };
type Kind = 'resource' | 'user';
function readBinding(value: unknown, kind: Kind): Binding {
  if (kind === 'resource') {
    const row = resource.parse(value);
    return { id: row.id, source: row.resource_link_id, target: row.stage_id };
  }
  const row = user.parse(value);
  return { id: row.id, source: row.lms_subject, target: row.user_id };
}
async function mutate(path: string, method: string, body: object): Promise<unknown> {
  const response = await fetch(path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('LTI operation not confirmed');
  return response.json();
}

export function LtiBindings({ platformId, orgId, onAssigned }: {
  platformId: string; orgId: string | null; onAssigned: (orgId: string) => void;
}) {
  const { t } = useI18n();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [tenant, setTenant] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  async function assign() {
    if (saving) return;
    setSaving(true); setFailed(false);
    try {
      const expected = z.uuid().parse(tenant.trim()).toLowerCase();
      const row = z.object({ id: z.uuid(), orgId: z.uuid() }).parse(
        await mutate('/api/lti/platforms', 'PATCH', { platformId, orgId: expected }),
      );
      if (row.id !== platformId || row.orgId.toLowerCase() !== expected) throw new Error('Invalid assignment');
      onAssigned(row.orgId);
    } catch { setFailed(true); } finally { setSaving(false); }
  }
  return <div className="pt-2">
    <Button variant="outline" size="sm" aria-expanded={open} aria-controls={formId}
      onClick={() => setOpen(!open)} disabled={saving}>{t('admin.lti.manageBindings')}</Button>
    {open && <div id={formId} className="space-y-4 pt-3">
      {!orgId ? <form onSubmit={(event) => { event.preventDefault(); void assign(); }}>
        <fieldset disabled={saving} className="space-y-2">
          <p className="text-sm">{t('admin.lti.assignHint')}</p>
          <label htmlFor={`${formId}-tenant`}>{t('admin.lti.orgId')}</label>
          <Input id={`${formId}-tenant`} value={tenant} onChange={(event) => setTenant(event.target.value)} required />
          <Button type="submit" size="sm">{t('admin.lti.assignTenant')}</Button>
          {failed && <p role="alert">{t('admin.lti.bindingWriteFailed')}</p>}
        </fieldset>
      </form> : <>
        <p className="text-sm text-muted-foreground">{t('admin.lti.bindingsHint')}</p>
        <BindingList key={`resource-${orgId}`} platformId={platformId} orgId={orgId} kind="resource" />
        <BindingList key={`user-${orgId}`} platformId={platformId} orgId={orgId} kind="user" />
      </>}
    </div>}
  </div>;
}

function BindingList({ platformId, orgId, kind }: { platformId: string; orgId: string; kind: Kind }) {
  const { t } = useI18n();
  const formId = useId();
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<{ bindings: Binding[]; nextOffset: number | null } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setPage(null); setLoadFailed(false);
    const params = new URLSearchParams({ platformId, kind, offset: String(offset) });
    void fetch(`/api/lti/bindings?${params}`, {
      cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
    }).then(async (response) => {
      if (!response.ok) throw new Error('LTI bindings unavailable');
      const result = z.object({ orgId: z.uuid(), bindings: z.array(z.unknown()).max(100), nextOffset: z.number().int().nonnegative().nullable() }).parse(await response.json());
      if (result.orgId !== orgId || (result.nextOffset !== null && result.nextOffset !== offset + 100)) throw new Error('Invalid LTI page');
      const bindings = result.bindings.map((row) => readBinding(row, kind));
      if (!controller.signal.aborted) setPage({ bindings, nextOffset: result.nextOffset });
    }).catch(() => { if (!controller.signal.aborted) setLoadFailed(true); });
    return () => controller.abort();
  }, [platformId, orgId, kind, offset, revision]);
  async function create() {
    if (saving) return;
    setSaving(true); setWriteFailed(false);
    try {
      const row = readBinding(await mutate('/api/lti/bindings', 'POST', {
        platformId, kind, ...(kind === 'resource'
          ? { resourceLinkId: source, stageId: target }
          : { lmsSubject: source, userId: target }),
      }), kind);
      if (row.source !== source || (kind === 'resource' ? row.target !== target : row.target.toLowerCase() !== target.toLowerCase())) throw new Error('Invalid saved binding');
      setSource(''); setTarget(''); setOffset(0); setRevision((value) => value + 1);
    } catch { setWriteFailed(true); } finally { setSaving(false); }
  }
  async function revoke(binding: Binding) {
    if (saving || !window.confirm(`${t('admin.lti.revokeConfirm')}\n${binding.source}\n${binding.target}`)) return;
    setSaving(true); setWriteFailed(false);
    try {
      z.object({ success: z.literal(true) }).parse(await mutate('/api/lti/bindings', 'DELETE', {
        platformId, kind, bindingId: binding.id,
      }));
      setOffset(0); setRevision((value) => value + 1);
    } catch { setWriteFailed(true); } finally { setSaving(false); }
  }
  return <section aria-labelledby={`${formId}-title`} className="rounded-lg border p-3 space-y-3">
    <h4 id={`${formId}-title`} className="font-medium">{t(kind === 'resource' ? 'admin.lti.resourceBindings' : 'admin.lti.userBindings')}</h4>
    <Button variant="outline" size="sm" disabled={saving} onClick={() => setRevision((value) => value + 1)}>{t('admin.lti.reloadBindings')}</Button>
    {loadFailed ? <p role="alert">{t('admin.lti.loadFailed')}</p> : !page ? <p role="status">{t('admin.lti.loadingBindings')}</p> : <>
      {page.bindings.length === 0 ? <p>{t('admin.lti.noBindings')}</p> : <ul className="space-y-2">
        {page.bindings.map((binding) => <li key={binding.id} className="flex flex-wrap items-center gap-2 border-b pb-2">
          <div className="min-w-0 flex-1"><code dir="ltr" className="block break-all">{binding.source}</code><code dir="ltr" className="block break-all">{binding.target}</code></div>
          <Button variant="outline" size="sm" disabled={saving} onClick={() => void revoke(binding)} aria-label={`${t('admin.lti.revokeBinding')} ${binding.source}`}>{t('admin.lti.revokeBinding')}</Button>
        </li>)}
      </ul>}
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" disabled={saving || offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>{t('admin.lti.previousBindings')}</Button>
        <Button variant="ghost" size="sm" disabled={saving || page.nextOffset === null} onClick={() => { if (page.nextOffset !== null) setOffset(page.nextOffset); }}>{t('admin.lti.nextBindings')}</Button>
      </div>
    </>}
    <form onSubmit={(event) => { event.preventDefault(); void create(); }}>
      <fieldset disabled={saving} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div><label htmlFor={`${formId}-source`}>{t(kind === 'resource' ? 'admin.lti.resourceLinkId' : 'admin.lti.lmsSubject')}</label>
          <Input id={`${formId}-source`} value={source} onChange={(event) => setSource(event.target.value)} maxLength={4096} required /></div>
        <div><label htmlFor={`${formId}-target`}>{t(kind === 'resource' ? 'admin.lti.stageId' : 'admin.lti.userId')}</label>
          <Input id={`${formId}-target`} value={target} onChange={(event) => setTarget(event.target.value)} maxLength={4096} required /></div>
        <Button type="submit" size="sm">{t('admin.lti.addBinding')}</Button>
      </fieldset>
    </form>
    {writeFailed && <p role="alert">{t('admin.lti.bindingWriteFailed')}</p>}
  </section>;
}
