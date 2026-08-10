import { type NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { requireSuperAdminOrOrgEditor } from '@/lib/api/auth';
import {
  buildEditorImageBriefRequestFromSource,
  parseEditorImageBrief,
} from '@/lib/edit/editor-image-prompt';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isValidClassroomId, readClassroomOwnership } from '@/lib/server/classroom-storage';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';

const log = createLogger('EditorImageBrief');

export const maxDuration = 60;

interface EditorImageBriefBody {
  classroomId?: string;
  sceneTitle?: string;
  transcript?: string;
  targetContext?: string;
  target?: { width?: number; height?: number };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as EditorImageBriefBody;
    const classroomId = body.classroomId?.trim();
    const transcript = body.transcript?.trim() ?? '';
    const width = body.target?.width;
    const height = body.target?.height;
    if (
      !classroomId ||
      !isValidClassroomId(classroomId) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      (width ?? 0) <= 0 ||
      (height ?? 0) <= 0 ||
      transcript.length > 20_000
    ) {
      return apiError('INVALID_REQUEST', 400, 'Invalid image brief request');
    }

    const ownership = await readClassroomOwnership(classroomId);
    if (!ownership) return apiError('INVALID_REQUEST', 404, 'Classroom not found');
    const auth = await requireSuperAdminOrOrgEditor(req, ownership.orgId, ownership.ownerId);
    if (auth.response) return auth.response;

    const request = buildEditorImageBriefRequestFromSource({
      sceneTitle: body.sceneTitle?.trim().slice(0, 500) ?? '',
      transcript,
      targetContext: body.targetContext?.trim().slice(0, 1_000) ?? 'Nouvelle zone visuelle.',
      target: { width: width!, height: height! },
    });
    const { model, thinkingConfig } = await resolveModelFromRequest(
      req,
      body as unknown as Record<string, unknown>,
      'generate-classroom',
    );
    const response = await callLLM(
      { model, system: request.system, prompt: request.source },
      'editor-image-brief',
      { retries: 1, validate: (text) => parseEditorImageBrief(text, transcript) !== null },
      thinkingConfig,
    );
    const brief = parseEditorImageBrief(response.text, transcript);
    if (!brief) return apiError('PARSE_FAILED', 502, 'Image brief was invalid');
    return apiSuccess(brief);
  } catch (error) {
    log.error('Editor image brief generation failed:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Image brief generation failed',
    );
  }
}
