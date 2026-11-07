import { describe, expect, it } from 'vitest';
import { describeUnparsable } from '@/lib/generation/scene-generator';

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
