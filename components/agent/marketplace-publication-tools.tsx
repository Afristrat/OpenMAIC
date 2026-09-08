'use client';

import { useState } from 'react';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { useI18n } from '@/lib/hooks/use-i18n';
import { PublishAgentDialog } from './publish-agent-dialog';
import { OwnedAgentPublications } from './owned-agent-publications';

export function MarketplacePublicationTools({ onChange }: { onChange: () => void }) {
  const { t } = useI18n();
  const { organizations, isLoading } = useOrganizations();
  const agents = useAgentRegistry((state) => state.agents);
  const [orgId, setOrgId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [revision, setRevision] = useState(0);
  const authorized = organizations.filter((org) => org.status === 'active' && ['admin', 'manager', 'author'].includes(org.userRole));
  const selectedOrg = authorized.find((org) => org.id === orgId);
  const customAgents = Object.values(agents).filter((agent) => !agent.isDefault);
  const selectedAgent = customAgents.find((agent) => agent.id === agentId);

  return <>
    <section className="mb-4 rounded-lg border p-4" aria-label={t('marketplace.publishDialog')}>
      <h2 className="mb-3 font-semibold">{t('marketplace.publishDialog')}</h2>
      {isLoading ? <p role="status">{t('common.loading')}</p> : authorized.length === 0 ?
        <p>{t('marketplace.authorRequired')}</p> : <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">{t('marketplace.publicationOrg')}
            <select className="rounded border bg-background p-2" value={orgId} onChange={(event) => setOrgId(event.target.value)}>
              <option value="">{t('marketplace.chooseOrg')}</option>
              {authorized.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">{t('marketplace.localAgent')}
            <select className="rounded border bg-background p-2" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
              <option value="">{t('marketplace.chooseAgent')}</option>
              {customAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </label>
          {customAgents.length === 0 && <p>{t('marketplace.noLocalAgent')}</p>}
          {selectedOrg && selectedAgent && <PublishAgentDialog key={`${selectedOrg.id}:${selectedAgent.id}`}
            orgId={selectedOrg.id} agent={selectedAgent} onPublished={() => { setRevision((value) => value + 1); onChange(); }} />}
        </div>}
    </section>
    <OwnedAgentPublications key={revision} onWithdraw={onChange} />
  </>;
}
