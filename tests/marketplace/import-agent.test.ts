import { expect, it } from 'vitest';
import { importMarketplaceAgent } from '@/lib/marketplace/import-agent';
import { getSystemAgents } from '@/lib/marketplace/system-agents';

it('imports the entire published configuration without resetting actions, voice or identity', () => {
  for (const agent of getSystemAgents()) {
    const imported = importMarketplaceAgent(agent.configuration, 'local-copy');
    expect(imported).toMatchObject({ ...agent.configuration, id: 'local-copy', isDefault: false });
    expect(imported?.allowedActions.length).toBeGreaterThan(0);
  }
  const configuration = {
    ...getSystemAgents()[0].configuration,
    priority: 9,
    interactionWeight: 37,
    gender: 'female',
    voiceDesign: { identity: 'Analyste', texture: 'Claire', delivery: 'Posée' },
  };
  expect(importMarketplaceAgent(configuration, 'copy')).toMatchObject(configuration);
});

it('refuses malformed profiles, unknown voice providers and injected credentials', () => {
  const configuration = getSystemAgents()[0].configuration;
  expect(importMarketplaceAgent(undefined, 'copy')).toBeNull();
  expect(importMarketplaceAgent({ ...configuration, priority: 100 }, 'copy')).toBeNull();
  expect(
    importMarketplaceAgent(
      {
        ...configuration,
        voiceConfig: { providerId: 'unknown', voiceId: 'voice' },
      },
      'copy',
    ),
  ).toBeNull();
  expect(
    importMarketplaceAgent(
      {
        ...configuration,
        voiceConfig: { ...configuration.voiceConfig, apiKey: 'forbidden' },
      },
      'copy',
    ),
  ).toBeNull();
});
