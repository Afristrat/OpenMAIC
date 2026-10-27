import { describe, expect, it } from 'vitest';
import {
  normalizeInterventionForm,
  parseDirectorDecision,
} from '@/lib/orchestration/director-prompt';

describe('normalizeInterventionForm', () => {
  it('keeps an exact form', () => {
    expect(normalizeInterventionForm('clarification')).toBe('clarification');
  });

  it('keeps the first valid form of a joined value', () => {
    expect(normalizeInterventionForm('clarification/question')).toBe('clarification');
    expect(normalizeInterventionForm('question, example')).toBe('question');
    expect(normalizeInterventionForm('Synthesis | feedback')).toBe('synthesis');
    expect(normalizeInterventionForm('example et question')).toBe('example');
  });

  it('refuses an unknown or non-text value', () => {
    expect(normalizeInterventionForm('lecture')).toBeUndefined();
    expect(normalizeInterventionForm(undefined)).toBeUndefined();
    expect(normalizeInterventionForm(42)).toBeUndefined();
  });
});

describe('parseDirectorDecision with a joined form', () => {
  it('no longer drops the decision of the learner question', () => {
    const decision = parseDirectorDecision(
      '{"next_agent":"persona-professor","trigger":"learner-question","form":"clarification/question","reason":"Réponse directe à la question."}',
    );
    expect(decision.shouldEnd).toBe(false);
    expect(decision.nextAgentId).toBe('persona-professor');
    expect(decision.trigger).toBe('learner-question');
    expect(decision.form).toBe('clarification');
    expect(decision.reason).toBe('Réponse directe à la question.');
  });
});
