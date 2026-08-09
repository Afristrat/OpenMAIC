import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperAdminOrOrgAuthor } from '@/lib/api/auth';
import { generateClassroomSchema } from '@/lib/api/schemas';
import { validateBody } from '@/lib/api/validate';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { generateClassroomPlan } from '@/lib/server/classroom-plan-generation';
import type { GenerateClassroomInput } from '@/lib/server/classroom-generation';
import { SourceMaterialConflictError } from '@/lib/server/source-material-alignment';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const validation = validateBody(
      generateClassroomSchema,
      await request.json().catch(() => null),
    );
    if (!validation.success) return validation.response;
    const parsed = validation.data;
    const auth = await requireSuperAdminOrOrgAuthor(request, parsed.orgId);
    if (auth.response) return auth.response;

    const input: GenerateClassroomInput = {
      orgId: parsed.orgId,
      authorRole: auth.authoredByRole,
      requirement: parsed.requirement,
      language: parsed.language,
      learningApproach: parsed.learningApproach,
      interactionLevel: parsed.interactionLevel,
      learningContext: {
        territory: parsed.learningContext.territory,
        currencyCode: parsed.learningContext.currencyCode.toUpperCase(),
      },
      pdfContent: parsed.pdfContent,
      enableImageGeneration: parsed.enableImageGeneration,
      enableVideoGeneration: parsed.enableVideoGeneration,
      interactiveMode: parsed.interactiveMode,
      activeSkillId: parsed.activeSkillId,
    };
    return apiSuccess(await generateClassroomPlan(input));
  } catch (error) {
    if (error instanceof SourceMaterialConflictError) {
      return NextResponse.json(
        {
          success: false as const,
          errorCode: 'SOURCE_MATERIAL_CONFLICT' as const,
          error: 'La demande et le document joint ne sont pas cohérents.',
          sourceAlignment: error.alignment,
        },
        { status: 409 },
      );
    }
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to prepare classroom plan',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
