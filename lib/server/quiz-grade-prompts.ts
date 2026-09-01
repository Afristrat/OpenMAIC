export interface GradeRequest {
  question: string;
  userAnswer: string;
  points: number;
  commentPrompt?: string;
  language?: string;
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
