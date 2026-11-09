import { describe, expect, it, vi } from 'vitest';
import type { SceneOutline } from '@/lib/types/generation';
import {
  UNPARSABLE_RESPONSE_DIRECTIVE,
  describeUnparsable,
  fallbackQuestionText,
  restoreMissingQuestionBraces,
  unwrapQuestionList,
} from '@/lib/generation/scene-generator';

describe('describeUnparsable', () => {
  it('never reproduces any text of the response', () => {
    const secret = 'Marge contributive confidentielle du client';
    const description = describeUnparsable(`[{"question":"${secret}"`);

    expect(description).not.toContain('Marge');
    expect(description).not.toContain('client');
  });

  it('tells a truncated response from a complete one', () => {
    expect(describeUnparsable('[{"a":1')).toContain('brackets=2/0');
    expect(describeUnparsable('[{"a":1}]')).toContain('brackets=2/2');
  });

  it('ignore les crochets écrits dans une chaîne', () => {
    expect(describeUnparsable('{"a":"}}}[["}')).toContain('brackets=1/1');
  });

  it('shows looping through the share of distinct lines', () => {
    expect(describeUnparsable('x\nx\nx\nx')).toContain('distinctLines=1/4');
  });

  it('flags a prose preamble', () => {
    expect(describeUnparsable('Voici le JSON : []')).toContain('starts=other');
  });
});

describe('restoreMissingQuestionBraces', () => {
  it('restores the opening brace of a question written without it, so the list parses', () => {
    const broken =
      '[{"id": "q1", "points": 15},\n \n    "id": "q3", "type": "short_answer", "points": 10}]';
    const fixed = JSON.parse(restoreMissingQuestionBraces(broken)) as Array<{ id: string }>;

    expect(fixed.map((question) => question.id)).toEqual(['q1', 'q3']);
  });

  it('laisse intact un JSON valide dont un objet imbriqué précède la clé id', () => {
    const valid = '[{"meta":{"level":1},"id":"q1","options":[{"x":{"a":1},"id":"A"}]}]';

    expect(restoreMissingQuestionBraces(valid)).toBe(valid);
    expect(JSON.parse(restoreMissingQuestionBraces(valid))).toEqual(JSON.parse(valid));
  });

  it('ne touche pas un motif }, "id": écrit dans une chaîne', () => {
    const valid = '[{"text":"Écrire {a}, \\"id\\": 5","id":"q1"}]';

    expect(restoreMissingQuestionBraces(valid)).toBe(valid);
  });

  it('restaure l’accolade dans un quiz enveloppé dans un objet', () => {
    const broken = '{"questions":[{"id":"q1"},\n"id":"q2"}]}';
    const fixed = JSON.parse(restoreMissingQuestionBraces(broken)) as {
      questions: Array<{ id: string }>;
    };

    expect(fixed.questions.map((question) => question.id)).toEqual(['q1', 'q2']);
  });

  it('leaves a well-formed list untouched', () => {
    const valid = '[{"id": "q1", "options": [{"value": "A"}]}, {"id": "q2"}]';

    expect(restoreMissingQuestionBraces(valid)).toBe(valid);
  });
});

describe('unwrapQuestionList', () => {
  it('extrait la liste d’un objet à une seule propriété tableau', () => {
    expect(unwrapQuestionList({ questions: [{ id: 'q1' }] })).toEqual([{ id: 'q1' }]);
  });

  it('refuse l’ambiguïté de deux tableaux et laisse un tableau ou une valeur nulle intacts', () => {
    const ambiguous = { a: [1], b: [2] };

    expect(unwrapQuestionList(ambiguous)).toBe(ambiguous);
    expect(unwrapQuestionList([1])).toEqual([1]);
    expect(unwrapQuestionList(null)).toBeNull();
  });
});

describe('journaux de parseJsonResponse', () => {
  it('ne consigne aucun extrait de la réponse illisible', async () => {
    vi.resetModules();
    const lines: string[] = [];
    vi.doMock('@/lib/logger', () => {
      const record = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
      return {
        createLogger: () => ({ debug: record, info: record, warn: record, error: record }),
      };
    });
    const { parseJsonResponse } = await import('@/lib/generation/json-repair');

    expect(parseJsonResponse('Passage confidentiel XYZ {oops')).toBeNull();
    expect(lines.join('\n')).not.toContain('XYZ');
    vi.doUnmock('@/lib/logger');
  });
});

describe('fallbackQuestionText', () => {
  const outline: SceneOutline = {
    id: 's',
    type: 'slide',
    title: 'Titre',
    description: 'd',
    keyPoints: ['ما هو الهدف؟'],
    order: 0,
  };

  it('retire la ponctuation arabe finale du point clé', () => {
    expect(fallbackQuestionText(outline, 'ar-MA')).toContain('«ما هو الهدف»');
  });
});

describe('UNPARSABLE_RESPONSE_DIRECTIVE', () => {
  it('demande du JSON strictement valide, avec chaque objet entouré de ses accolades', () => {
    expect(UNPARSABLE_RESPONSE_DIRECTIVE).toContain('valid JSON');
    expect(UNPARSABLE_RESPONSE_DIRECTIVE).toContain('own braces');
  });
});
