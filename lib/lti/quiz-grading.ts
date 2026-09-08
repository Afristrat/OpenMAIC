import { z } from 'zod';
import { callLLM } from '@/lib/ai/llm';
import { gradeChoiceQuestions, type QuestionResult } from '@/lib/quiz/grading';
import { resolveModel } from '@/lib/server/resolve-model';
import { buildQuizGradePrompts } from '@/lib/server/quiz-grade-prompts';

const text = z.string().trim().min(1).max(20000);
const questionSchema = z.object({
  id: z.string().min(1).max(256),
  type: z.enum(['single', 'multiple', 'short_answer']),
  question: text,
  points: z.number().finite().positive().max(10000).default(1),
  options: z.array(z.object({ label: text, value: text })).max(100).optional(),
  answer: z.array(text).max(100).optional(),
  commentPrompt: text.optional(),
}).superRefine((question, ctx) => {
  if (question.type === 'short_answer') return;
  const options = question.options?.map((option) => option.value) ?? [];
  const answers = question.answer ?? [];
  if (!options.length || new Set(options).size !== options.length || !answers.length ||
      new Set(answers).size !== answers.length || answers.some((answer) => !options.includes(answer)) ||
      (question.type === 'single' && answers.length !== 1)) {
    ctx.addIssue({ code: 'custom', message: 'Invalid choice answer key' });
  }
});
const quizSchema = z.object({
  type: z.literal('quiz'),
  questions: z.array(questionSchema).min(1).max(100),
}).refine(({ questions }) => new Set(questions.map((question) => question.id)).size === questions.length);
const answersSchema = z.record(z.string().max(256), z.union([
  z.string().max(20000), z.array(z.string().max(20000)).max(100),
]));

/** Caller must authorize and load persisted content, and provide the usage-metering context. */
export async function gradeLtiQuiz(content: unknown, submittedAnswers: unknown, language: string) {
  const quiz = quizSchema.safeParse(content);
  const submitted = answersSchema.safeParse(submittedAnswers);
  if (!quiz.success || !submitted.success) throw new Error('Invalid LTI quiz submission');
  const { questions } = quiz.data;
  const answers = submitted.data;
  if (Object.keys(answers).some((id) => !questions.some((question) => question.id === id))) {
    throw new Error('Unknown LTI quiz question');
  }
  // Validate the entire submission before spending tokens or returning any grade.
  for (const question of questions) {
    const answer = answers[question.id];
    if (question.type === 'short_answer') {
      if (Array.isArray(answer)) throw new Error('Invalid LTI text answer');
    } else {
      const selected = answer === undefined || answer === '' ? [] : Array.isArray(answer) ? answer : [answer];
      if (new Set(selected).size !== selected.length ||
          (question.type === 'single' && selected.length > 1) ||
          selected.some((value) => !question.options?.some((option) => option.value === value))) {
        throw new Error('Invalid LTI choice answer');
      }
    }
  }
  const results = new Map(gradeChoiceQuestions(questions, answers).map((result) => [result.questionId, result]));
  for (const question of questions.filter((item) => item.type === 'short_answer')) {
    const answer = answers[question.id] as string | undefined; // Validated above before any model call.
    let earned = 0;
    let aiComment: string | undefined;
    if (answer?.trim()) {
      const { model, thinkingConfig } = await resolveModel({ stage: 'quiz-grade' });
      const prompts = buildQuizGradePrompts({
        question: question.question, userAnswer: answer, points: question.points,
        commentPrompt: [question.commentPrompt, question.answer?.length
          ? `Reference answer: ${question.answer.join('; ')}` : undefined].filter(Boolean).join('\n'),
        language,
      });
      const result = await callLLM({ model, system: prompts.system, prompt: prompts.user }, 'quiz-grade', undefined, thinkingConfig);
      try {
        const parsed = z.object({
          score: z.number().finite().min(0).max(question.points),
          comment: z.string().max(4000),
        }).parse(JSON.parse(result.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')));
        earned = parsed.score;
        aiComment = parsed.comment;
      } catch {
        throw new Error('LTI answer grading unavailable');
      }
    }
    const correct = earned >= question.points * 0.8;
    results.set(question.id, { questionId: question.id, earned, correct,
      status: correct ? 'correct' : 'incorrect', ...(aiComment === undefined ? {} : { aiComment }) });
  }
  const ordered: QuestionResult[] = questions.map((question) => results.get(question.id)!);
  const total = questions.reduce((sum, question) => sum + question.points, 0);
  const score = Math.round(ordered.reduce((sum, result) => sum + result.earned, 0) / total * 10000) / 100;
  return { results: ordered, score };
}
