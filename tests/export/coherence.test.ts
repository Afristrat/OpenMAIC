import { describe, expect, it } from 'vitest';
import { coherencePrompt, narrationOf, parseCoherence } from '@/lib/export/coherence';

describe('narrationOf', () => {
  it('keeps only the spoken lines, in order', () => {
    expect(
      narrationOf([
        { type: 'spotlight', elementId: 'a' },
        { type: 'speech', text: ' Ouvrez la page. ' },
        { type: 'speech', text: '' },
        { type: 'speech', text: 'Cliquez sur le bouton.' },
        null,
      ]),
    ).toBe('Ouvrez la page.\nCliquez sur le bouton.');
  });

  it('returns an empty narration for a scene without speech', () => {
    expect(narrationOf(undefined)).toBe('');
    expect(narrationOf([{ type: 'spotlight' }])).toBe('');
  });
});

describe('coherencePrompt', () => {
  it('asks for the reasons in the course language and carries the narration', () => {
    const { system, prompt } = coherencePrompt('Cliquez ici.', 'fr');
    expect(system).toContain('French');
    expect(prompt).toContain('Cliquez ici.');
  });
});

describe('parseCoherence', () => {
  it('reads a coherent verdict and drops stray problems', () => {
    expect(
      parseCoherence('{"verdict":"coherent","problems":[{"quote":"a","reason":"b"}]}'),
    ).toEqual({ verdict: 'coherent', problems: [] });
  });

  it('reads an incoherent verdict with its quoted fragment', () => {
    const verdict = parseCoherence(
      '```json\n{"verdict":"incoherent","problems":[{"quote":"recevoir votre lien","reason":"L’écran demande un mot de passe."}]}\n```',
    );
    expect(verdict).toEqual({
      verdict: 'incoherent',
      problems: [{ quote: 'recevoir votre lien', reason: 'L’écran demande un mot de passe.' }],
    });
  });

  it('refuses an unreadable answer, an unknown verdict and a disagreement without any grievance', () => {
    expect(parseCoherence('pas du json')).toBeNull();
    expect(parseCoherence('{"verdict":"maybe","problems":[]}')).toBeNull();
    expect(parseCoherence('{"verdict":"partial","problems":[]}')).toBeNull();
    expect(
      parseCoherence('{"verdict":"partial","problems":[{"quote":"","reason":"x"}]}'),
    ).toBeNull();
  });

  it('keeps at most five problems', () => {
    const problems = Array.from({ length: 8 }, (_, i) => ({ quote: `q${i}`, reason: `r${i}` }));
    const verdict = parseCoherence(JSON.stringify({ verdict: 'partial', problems }));
    expect(verdict?.problems).toHaveLength(5);
  });
});
