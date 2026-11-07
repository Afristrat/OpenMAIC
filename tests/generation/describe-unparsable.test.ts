import { describe, expect, it } from 'vitest';
import { describeUnparsable, unwrapQuestionList } from '@/lib/generation/scene-generator';

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

describe('unwrapQuestionList', () => {
  it('keeps a bare array', () => {
    expect(unwrapQuestionList([{ id: 'q1' }])).toHaveLength(1);
  });

  it('accepts a single wrapper object around the list', () => {
    expect(unwrapQuestionList({ questions: [{ id: 'q1' }, { id: 'q2' }] })).toHaveLength(2);
  });

  it('refuses an ambiguous or empty wrapper and scalars', () => {
    expect(unwrapQuestionList({ a: [1], b: [2] })).toBeNull();
    expect(unwrapQuestionList({ title: 'x' })).toBeNull();
    expect(unwrapQuestionList('texte')).toBeNull();
    expect(unwrapQuestionList(null)).toBeNull();
  });
});
