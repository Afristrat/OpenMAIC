import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  buildLiveInstructionalDirective,
  FORMATION_ENGINE_CONSUMERS,
  FORMATION_ENGINE_REFERENCES,
} from '@/lib/formation-engine/downstream-consumers';
import {
  PERSONA_CATALOG,
  PERSONA_FORMATION_ENGINE_CONSUMER_ID,
} from '@/lib/agents/persona-catalog';

const root = process.cwd();

function registry(path: string) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as {
    consumerId: string;
    inherits: typeof FORMATION_ENGINE_REFERENCES;
    localOwnership: string[];
    doctrineOwnership: string;
  };
}

function collectDoctrineConsumerSources(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return [collectDoctrineConsumerSources(path)];
      return entry.isFile() && /\.(?:json|md)$/u.test(entry.name)
        ? [readFileSync(path, 'utf8')]
        : [];
    })
    .join('\n');
}

describe('formation engine downstream consumers', () => {
  it('makes the live personality registry consume the central engine contract', () => {
    expect(PERSONA_FORMATION_ENGINE_CONSUMER_ID).toBe(
      FORMATION_ENGINE_CONSUMERS.livePersonalityRegistry,
    );
    const directive = buildLiveInstructionalDirective({
      approach: 'andragogy',
      audienceStage: 'adult-professional',
      expertiseLevel: 'advanced',
      interactionLevel: 'immersive',
    });
    expect(directive).toContain(FORMATION_ENGINE_REFERENCES.platformPublication);
    expect(directive).toContain('Use no universal');
  });

  it('keeps persona definitions to voice and interaction instead of copied doctrine', () => {
    const personas = PERSONA_CATALOG.map((persona) => persona.persona).join('\n');
    expect(personas).not.toMatch(
      /ADDIE|Bloom|Knowles|Kirkpatrick|charge cognitive|ratio universel|apprentissage entre pairs/iu,
    );
  });

  it('finds no copied framework doctrine in VIVRE or ANCRER sources', () => {
    const downstreamSources = [
      collectDoctrineConsumerSources(resolve(root, 'docs/foundation/2-vivre')),
      collectDoctrineConsumerSources(resolve(root, 'docs/foundation/3-ancrer')),
    ].join('\n');

    expect(downstreamSources).not.toMatch(
      /ADDIE|Bloom|Knowles|Kirkpatrick|ratio universel|charge cognitive|apprentissage entre pairs/iu,
    );
  });

  it.each([
    [
      'docs/foundation/2-vivre/formation-engine-consumer.json',
      FORMATION_ENGINE_CONSUMERS.livePersonalityRegistry,
    ],
    [
      'docs/foundation/3-ancrer/formation-engine-consumer.json',
      FORMATION_ENGINE_CONSUMERS.anchoringSeedRegistry,
    ],
  ])('keeps %s as a reference-only registry', (path, consumerId) => {
    const consumer = registry(path);
    expect(consumer.consumerId).toBe(consumerId);
    expect(consumer.inherits).toEqual(FORMATION_ENGINE_REFERENCES);
    expect(consumer.doctrineOwnership).toBe('formation-engine-only');
    expect(consumer.localOwnership.length).toBeGreaterThan(0);
    expect(JSON.stringify(consumer)).not.toMatch(
      /ADDIE|Bloom|Knowles|Kirkpatrick|theory-share|practice-share|peer-learning-share/iu,
    );
  });
});
