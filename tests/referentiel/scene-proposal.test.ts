import { describe, expect, it } from 'vitest';
import {
  excerptOf,
  parseProposals,
  proposalPrompt,
  type ProposalCompetency,
  type ProposalScene,
} from '@/lib/referentiel/scene-proposal';

const scenes: ProposalScene[] = [
  { id: 's1', title: 'Introduction', type: 'slide', excerpt: 'Les langages de balisage' },
  { id: 's2', title: 'Quiz HTML', type: 'quiz', excerpt: 'Quelle balise ?' },
];
const competencies: ProposalCompetency[] = [
  { uri: 'skill-a', title: 'utiliser des langages de balisage' },
  { uri: 'skill-b', title: 'déboguer un logiciel' },
];

describe('excerptOf', () => {
  it('keeps readable text, strips markup, ignores URLs and long identifiers, and stays bounded', () => {
    const content = {
      elements: [
        { type: 'text', content: '<p>Les <b>balises</b> HTML</p>' },
        { src: 'https://cdn.example/image.png' },
        { id: '0a1b2c3d-4e5f-6789-abcd-ef0123456789' },
        { question: 'Quelle balise ouvre un paragraphe ?' },
      ],
    };

    const excerpt = excerptOf(content);

    expect(excerpt).toContain('Les balises HTML');
    expect(excerpt).toContain('Quelle balise ouvre un paragraphe ?');
    expect(excerpt).not.toContain('https://');
    expect(excerpt).not.toContain('0a1b2c3d');
    expect(excerptOf('x'.repeat(5000)).length).toBeLessThanOrEqual(500);
  });
});

describe('proposalPrompt', () => {
  it('lists the scenes and only the target skills, with their identifiers', () => {
    const { prompt, system } = proposalPrompt(scenes, competencies);
    const payload = JSON.parse(prompt) as { scenes: { id: string }[]; skills: { id: string }[] };

    expect(payload.scenes.map((scene) => scene.id)).toEqual(['s1', 's2']);
    expect(payload.skills.map((skill) => skill.id)).toEqual(['skill-a', 'skill-b']);
    expect(system).toContain('Never invent an identifier');
  });
});

describe('parseProposals', () => {
  it('keeps only known scenes and known skills, without duplicates', () => {
    const text = JSON.stringify({
      links: [
        { sceneId: 's1', skillId: 'skill-a', nature: 'worked' },
        { sceneId: 's1', skillId: 'skill-a', nature: 'worked' },
        { sceneId: 'ghost', skillId: 'skill-a', nature: 'worked' },
        { sceneId: 's2', skillId: 'invented', nature: 'assessed' },
        'garbage',
      ],
    });

    expect(parseProposals(text, scenes, competencies)).toEqual([
      { sceneId: 's1', uri: 'skill-a', nature: 'travaillee' },
    ]);
  });

  it('allows the assessed nature on a quiz only', () => {
    const text = JSON.stringify({
      links: [
        { sceneId: 's2', skillId: 'skill-a', nature: 'assessed' },
        { sceneId: 's1', skillId: 'skill-b', nature: 'assessed' },
      ],
    });

    expect(parseProposals(text, scenes, competencies)).toEqual([
      { sceneId: 's2', uri: 'skill-a', nature: 'evaluee' },
      { sceneId: 's1', uri: 'skill-b', nature: 'travaillee' },
    ]);
  });

  it('caps the links per scene at three', () => {
    const many: ProposalCompetency[] = ['a', 'b', 'c', 'd'].map((id) => ({ uri: id, title: id }));
    const text = JSON.stringify({
      links: many.map((skill) => ({ sceneId: 's1', skillId: skill.uri, nature: 'worked' })),
    });

    expect(parseProposals(text, scenes, many)).toHaveLength(3);
  });

  it('accepts an empty answer and rejects a malformed one so the call is retried', () => {
    expect(parseProposals('{"links":[]}', scenes, competencies)).toEqual([]);
    expect(parseProposals('pas du JSON', scenes, competencies)).toBeNull();
    expect(parseProposals('{"other":1}', scenes, competencies)).toBeNull();
  });
});
