import { describe, expect, it } from 'vitest';
import { describeUnparsable, restoreMissingQuestionBraces } from '@/lib/generation/scene-generator';

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

  it('leaves a well-formed list untouched', () => {
    const valid = '[{"id": "q1", "options": [{"value": "A"}]}, {"id": "q2"}]';

    expect(restoreMissingQuestionBraces(valid)).toBe(valid);
  });
});
