import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

describe('complexity crescendo in generation prompts', () => {
  it('asks the course outline for practice scenes of rising complexity', () => {
    const outline = read('lib/prompts/templates/requirements-to-outlines/system.md');
    expect(outline).toContain('**Complexity Crescendo**');
    expect(outline).toContain('ordered by rising complexity');
  });

  it.each([
    'lib/pbl/v2/prompts/planner-single-call-system.md',
    'lib/pbl/v2/prompts/planner-system.md',
  ])('asks the project planner %s for milestones that rise in difficulty', (path) => {
    const prompt = read(path);
    expect(prompt).toContain('**Crescendo of complexity.**');
    expect(prompt).toContain('never end on a task easier than the one before it');
  });

  it('makes the single-call planner re-check the difficulty before answering', () => {
    expect(read('lib/pbl/v2/prompts/planner-single-call-system.md')).toContain('crescendo rule 17');
  });
});
