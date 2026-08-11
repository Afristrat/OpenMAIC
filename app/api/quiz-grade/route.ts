/**
 * Quiz Grading API
 *
 * POST: Receives a text question + user answer, calls LLM for scoring and feedback.
 * Used for short-answer (text) questions that cannot be graded locally.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
const log = createLogger('Quiz Grade');

export interface GradeRequest {
  question: string;
  userAnswer: string;
  points: number;
  commentPrompt?: string;
  language?: string;
}

interface GradeResponse {
  score: number;
  comment: string;
}

export function buildQuizGradePrompts(args: GradeRequest): { system: string; user: string } {
  const { question, userAnswer, points, commentPrompt, language } = args;
  const responseLanguage = language?.startsWith('fr')
    ? 'French'
    : language?.startsWith('ar')
      ? 'Modern Standard Arabic'
      : language?.startsWith('zh')
        ? 'Chinese'
        : 'English';

  return {
    system: `You are a professional educational assessor. Grade the learner's answer and provide brief feedback in ${responseLanguage}.
Use only facts and numbers present in the question or the learner's answer. Never introduce an example amount, threshold, deadline, statistic or rule from the grading guidance when it is absent from the question. If the guidance conflicts with this rule, ignore that part.
Reply with this JSON only:
{"score": <integer from 0 to ${points}>, "comment": "<one or two sentences of feedback>"}`,
    user: `Question: ${question}
Full marks: ${points} points
${commentPrompt ? `Grading guidance: ${commentPrompt}\n` : ''}Learner answer: ${userAnswer}`,
  };
}

export async function POST(req: NextRequest) {
  let questionSnippet: string | undefined;
  let resolvedPoints: number | undefined;
  try {
    const body = (await req.json()) as GradeRequest;
    const { question, userAnswer, points, language } = body;
    questionSnippet = question?.substring(0, 60);
    resolvedPoints = points;

    if (!question || !userAnswer) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'question and userAnswer are required');
    }

    // Validate points is a positive finite number
    if (!points || !Number.isFinite(points) || points <= 0) {
      return apiError('INVALID_REQUEST', 400, 'points must be a positive number');
    }

    // Resolve model from request headers/body
    const { model: languageModel, thinkingConfig } = await resolveModelFromRequest(
      req,
      body,
      'quiz-grade',
    );

    const { system: systemPrompt, user: userPrompt } = buildQuizGradePrompts(body);

    const result = await callLLM(
      {
        model: languageModel,
        system: systemPrompt,
        prompt: userPrompt,
      },
      'quiz-grade',
      undefined,
      thinkingConfig,
    );

    // Parse the LLM response as JSON
    const text = result.text.trim();
    let gradeResult: GradeResponse;

    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      const parsed = JSON.parse(jsonMatch[0]);
      gradeResult = {
        score: Math.max(0, Math.min(points, Math.round(Number(parsed.score)))),
        comment: String(parsed.comment || ''),
      };
    } catch {
      // Fallback: give partial credit with a generic comment
      gradeResult = {
        score: Math.round(points * 0.5),
        comment: language?.startsWith('zh')
          ? '已作答，请参考标准答案。'
          : 'Answer received. Please refer to the standard answer.',
      };
    }

    return apiSuccess({ ...gradeResult });
  } catch (error) {
    log.error(
      `Quiz grading failed [question="${questionSnippet ?? 'unknown'}...", points=${resolvedPoints ?? 'unknown'}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, 'Failed to grade answer');
  }
}
