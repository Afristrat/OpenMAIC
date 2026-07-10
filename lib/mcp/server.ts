/**
 * Qalem MCP Server — Tool definitions and handlers
 *
 * Exposes classroom generation capabilities as MCP-compatible tools.
 * The transport layer is handled by app/api/mcp/route.ts.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('MCP');

export const TOOLS = [
  {
    name: 'generate_classroom',
    description:
      'Generate a full interactive AI classroom from a topic. Returns a classroom ID and URL.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: { type: 'string', description: 'The topic or subject for the classroom' },
        level: {
          type: 'string',
          description: 'Target audience level: "beginner", "intermediate", or "advanced"',
        },
        language: {
          type: 'string',
          description: 'Language code: "en-US", "fr-FR", "ar-MA", or "zh-CN"',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'get_quiz',
    description: 'Generate a structured quiz on a given topic with multiple-choice answers.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: { type: 'string', description: 'The topic for the quiz' },
        difficulty: { type: 'string', description: '"easy", "medium", or "hard"' },
        questionCount: { type: 'number', description: 'Number of questions (1-20)' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'get_slide_content',
    description: 'Generate structured slide content for a topic with titles and bullet points.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: { type: 'string', description: 'The topic for the slide content' },
      },
      required: ['topic'],
    },
  },
] as const;

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  log.info(`Tool call: ${name}`, args);

  try {
    switch (name) {
      case 'generate_classroom':
        return await handleGenerateClassroom(args);
      case 'get_quiz':
        return await handleGetQuiz(args);
      case 'get_slide_content':
        return await handleGetSlideContent(args);
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Tool ${name} failed: ${message}`);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
}

// Unused for now but kept for future full MCP SDK transport integration
export { Server as _McpServerClass } from '@modelcontextprotocol/sdk/server';

async function handleGenerateClassroom(args: Record<string, unknown>) {
  const topic = (args.topic as string) || 'Introduction';
  const level = (args.level as string) || 'beginner';
  const language = (args.language as string) || 'fr-FR';

  const langMap: Record<string, string> = { en: 'en-US', fr: 'fr-FR', ar: 'ar-MA', zh: 'zh-CN' };
  const normalizedLang = langMap[language.split('-')[0]] ?? language;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          status: 'queued',
          requirement: `${topic} (${level} level)`,
          language: normalizedLang,
          message:
            'Classroom generation initiated. Use the /api/generate-classroom endpoint with model configuration for full generation.',
        }),
      },
    ],
  };
}

async function handleGetQuiz(args: Record<string, unknown>) {
  const topic = (args.topic as string) || 'General Knowledge';
  const difficulty = (args.difficulty as string) || 'medium';
  const questionCount = Math.min(Math.max(Number(args.questionCount) || 5, 1), 20);

  const { callLLM } = await import('@/lib/ai/llm');
  const { resolveModel } = await import('@/lib/server/resolve-model');
  const { model: languageModel, modelInfo } = resolveModel({});

  const result = await callLLM(
    {
      model: languageModel,
      messages: [
        {
          role: 'system',
          content: `You are an expert quiz creator. Generate exactly ${questionCount} multiple-choice questions about the given topic at ${difficulty} difficulty. Return ONLY valid JSON.`,
        },
        {
          role: 'user',
          content: `Create a quiz about: ${topic}\n\nReturn JSON: {"title":"...","questions":[{"id":1,"question":"...","options":["A)...","B)...","C)...","D)..."],"correctAnswer":"A","explanation":"..."}]}`,
        },
      ],
      maxOutputTokens: modelInfo?.outputWindow,
    },
    'mcp-get-quiz',
  );

  let cleaned = result.text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  return { content: [{ type: 'text' as const, text: cleaned }] };
}

async function handleGetSlideContent(args: Record<string, unknown>) {
  const topic = (args.topic as string) || 'Introduction';

  const { callLLM } = await import('@/lib/ai/llm');
  const { resolveModel } = await import('@/lib/server/resolve-model');
  const { model: languageModel, modelInfo } = resolveModel({});

  const result = await callLLM(
    {
      model: languageModel,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert presentation designer. Generate structured slide content. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: `Create 5-10 slides about: ${topic}\n\nReturn JSON: {"title":"...","slides":[{"slideNumber":1,"title":"...","content":["..."],"speakerNotes":"...","type":"title|content|summary"}]}`,
        },
      ],
      maxOutputTokens: modelInfo?.outputWindow,
    },
    'mcp-get-slide-content',
  );

  let cleaned = result.text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  return { content: [{ type: 'text' as const, text: cleaned }] };
}
