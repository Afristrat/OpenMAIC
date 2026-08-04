import { describe, expect, it } from 'vitest';

import { buildSystemPrompt } from '@/lib/agent/runtime/build-agent';

describe('buildSystemPrompt capability boundary', () => {
  const prompt = buildSystemPrompt({ id: 's1', title: 'Photosynthesis' }, [
    { id: 's2', title: 'Practice', type: 'quiz', order: 2 },
    { id: 's1', title: 'Photosynthesis', type: 'slide', order: 1 },
  ]).toLowerCase();

  it('grants reading and slide regeneration', () => {
    expect(prompt).toContain('read_scene_content');
    expect(prompt).toContain('regenerate_scene');
  });

  it('grants interactive-scene bug fixing', () => {
    expect(prompt).toContain('edit_interactive_html');
    expect(prompt).toContain('interactive');
  });

  it('still forbids structural and non-slide edits', () => {
    expect(prompt).toContain('cannot');
    // Structural ops remain out of scope.
    expect(prompt).toMatch(/add|delete|reorder|duplicate/);
  });

  it('distinguishes the current slide from whole-presentation regeneration', () => {
    expect(prompt).toContain('only the current slide');
    expect(prompt).toContain('diaporama');
    expect(prompt).toContain('exactly once for every listed scene');
    expect(prompt).toContain('keep those calls sequential');
    expect(prompt).toContain('does not require `read_scene_content` first');
  });

  it('embeds the ordered presentation scene inventory as quoted data', () => {
    expect(prompt.indexOf('"id":"s1"')).toBeLessThan(prompt.indexOf('"id":"s2"'));
    expect(prompt).toContain('"type":"slide"');
    expect(prompt).toContain('"type":"quiz"');
  });

  it('embeds the active scene id/title', () => {
    expect(prompt).toContain('s1');
    expect(prompt).toContain('photosynthesis');
  });

  it('forbids AI-looking dash punctuation in French content', () => {
    expect(prompt).toContain('never use an em dash');
    expect(prompt).toContain('normal french punctuation');
  });
});
