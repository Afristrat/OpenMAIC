import { describe, expect, it } from 'vitest';

import { buildQuizGradePrompts } from '@/app/api/quiz-grade/route';

describe('quiz grading prompt', () => {
  it('impose la langue de la classroom et interdit les montants absents de la question', () => {
    const prompts = buildQuizGradePrompts({
      question: 'Comment interpréter le seuil configurable ?',
      userAnswer: 'Il faut vérifier les entrées et sorties.',
      points: 20,
      commentPrompt: 'Ne pas utiliser un exemple de 10 000 MAD.',
      language: 'fr-FR',
    });

    expect(prompts.system).toContain('feedback in French');
    expect(prompts.system).toContain('Never introduce an example amount');
    expect(prompts.system).toContain('absent from the question');
  });
});
