import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gradeLtiQuiz } from '@/lib/lti/quiz-grading';

const mocks = vi.hoisted(() => ({ call: vi.fn(), resolve: vi.fn() }));
vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.call }));
vi.mock('@/lib/server/resolve-model', () => ({ resolveModel: mocks.resolve }));
const choice = { id: 'choice', type: 'single', question: 'Choose A', points: 1,
  options: [{ label: 'A', value: 'A' }, { label: 'B', value: 'B' }], answer: ['A'] };
const short = { id: 'text', type: 'short_answer', question: 'Explain', points: 3 };
const content = { type: 'quiz', questions: [choice, short] };

describe('server-authoritative LTI quiz grading', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.resolve.mockResolvedValue({ model: 'server-model' }); });
  it('weights persisted points, preserves question order and uses only the server model', async () => {
    mocks.call.mockResolvedValue({ text: '{"score":2,"comment":"Précisez votre réponse."}' });
    const grade = await gradeLtiQuiz(content, { choice: 'A', text: 'Explanation' }, 'fr-FR');
    expect(grade.score).toBe(75);
    expect(grade.results.map((result) => result.questionId)).toEqual(['choice', 'text']);
    expect(mocks.resolve).toHaveBeenCalledWith({ stage: 'quiz-grade' });
  });
  it('scores unanswered questions zero without invoking AI', async () => {
    expect((await gradeLtiQuiz(content, {}, 'ar-MA')).score).toBe(0);
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it.each(['not JSON', '{"score":"2","comment":"x"}', '{"score":4,"comment":"x"}', '{"score":-1,"comment":"x"}'])('rejects malformed model output without half-credit: %s', async (text) => {
    mocks.call.mockResolvedValue({ text });
    await expect(gradeLtiQuiz(content, { text: 'answer' }, 'en-US')).rejects.toThrow('LTI answer grading unavailable');
  });
  it.each([{ choice: ['A', 'A'] }, { choice: 'foreign' }, { text: ['answer'] }, { foreign: 'answer' }])('rejects invalid answers before AI: %j', async (answers) => {
    await expect(gradeLtiQuiz(content, answers, 'fr-FR')).rejects.toThrow();
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it.each([{ ...choice, answer: [] }, { ...choice, points: 0 }, { ...choice, answer: ['foreign'] }])('refuses invalid persisted question: %j', async (question) => {
    await expect(gradeLtiQuiz({ type: 'quiz', questions: [question] }, {}, 'fr-FR')).rejects.toThrow();
  });
  it('propagates provider failure instead of producing a grade', async () => {
    mocks.call.mockRejectedValue(new Error('unavailable'));
    await expect(gradeLtiQuiz(content, { text: 'answer' }, 'fr-FR')).rejects.toThrow('unavailable');
  });
});
