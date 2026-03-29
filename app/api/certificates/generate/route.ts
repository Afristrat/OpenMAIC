import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  generateVerificationCode,
  certificateFromRow,
  meetsScoreThreshold,
  type CertificateRow,
} from '@/lib/certificates';

/**
 * POST /api/certificates/generate
 *
 * Generate a certificate for a learner who completed a classroom stage.
 *
 * Body: { stageId: string }
 *
 * Requirements:
 *  - Authenticated user
 *  - User has quiz_results for all quiz scenes in the stage
 *  - Average quiz score >= 60 %
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // --- Auth -----------------------------------------------------------
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return apiError(API_ERROR_CODES.MISSING_API_KEY, 401, 'Authentication required');
    }

    // --- Body -----------------------------------------------------------
    const body = (await request.json()) as { stageId?: string };
    const { stageId } = body;

    if (!stageId) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing required field: stageId');
    }

    // --- Check if certificate already exists ----------------------------
    const { data: existing } = await supabase
      .from('certificates')
      .select('*')
      .eq('user_id', user.id)
      .eq('stage_id', stageId)
      .maybeSingle();

    if (existing) {
      const baseUrl = buildBaseUrl(request);
      return apiSuccess({
        certificate: certificateFromRow(existing as CertificateRow, baseUrl),
        alreadyExisted: true,
      });
    }

    // --- Fetch stage ----------------------------------------------------
    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .select('id, name, org_id')
      .eq('id', stageId)
      .single();

    if (stageError || !stage) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Stage not found');
    }

    // --- Fetch all scenes for this stage --------------------------------
    const { data: scenes } = await supabase
      .from('scenes')
      .select('id, type, title')
      .eq('stage_id', stageId);

    if (!scenes || scenes.length === 0) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Stage has no scenes');
    }

    // --- Verify completion via quiz_results -----------------------------
    // Identify quiz scenes and check each has a result for this user.
    const quizScenes = scenes.filter((s) => s.type === 'quiz');

    if (quizScenes.length === 0) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        'Stage has no quiz scenes — cannot compute a score',
      );
    }

    const quizSceneIds = quizScenes.map((s) => s.id);

    const { data: quizResults } = await supabase
      .from('quiz_results')
      .select('scene_id, score')
      .eq('user_id', user.id)
      .eq('stage_id', stageId)
      .in('scene_id', quizSceneIds);

    if (!quizResults || quizResults.length === 0) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        'No quiz results found — complete the quizzes first',
      );
    }

    // Check that every quiz scene has at least one result
    const completedSceneIds = new Set(quizResults.map((r) => r.scene_id));
    const missingScenes = quizSceneIds.filter((id) => !completedSceneIds.has(id));

    if (missingScenes.length > 0) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        `Incomplete: ${missingScenes.length} quiz scene(s) not yet completed`,
      );
    }

    // --- Compute average score ------------------------------------------
    // quiz_results.score is stored as a percentage (0-100).
    let totalScore = 0;
    let count = 0;

    for (const result of quizResults) {
      const s = Number(result.score);
      if (!isNaN(s)) {
        totalScore += s;
        count += 1;
      }
    }

    const avgScore = count > 0 ? totalScore / count : 0;

    if (!meetsScoreThreshold(avgScore)) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        `Quiz score ${Math.round(avgScore)}% is below the required 60% threshold`,
      );
    }

    // --- Learner profile ------------------------------------------------
    const { data: profile } = await supabase
      .from('profiles')
      .select('nickname')
      .eq('id', user.id)
      .single();

    const learnerName = profile?.nickname || user.email || 'Learner';

    // --- Skills from scene titles (quiz & interactive) ------------------
    const skills = scenes
      .filter((s) => s.type === 'quiz' || s.type === 'interactive')
      .map((s) => s.title)
      .filter((title): title is string => typeof title === 'string' && title.length > 0);

    // --- Organization name (if applicable) -----------------------------
    let issuedBy = 'Qalem';
    if (stage.org_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', stage.org_id)
        .single();
      if (org?.name) {
        issuedBy = org.name;
      }
    }

    // --- Generate & insert ---------------------------------------------
    const verificationCode = generateVerificationCode();

    const { data: inserted, error: insertError } = await supabase
      .from('certificates')
      .insert({
        user_id: user.id,
        stage_id: stageId,
        course_name: stage.name,
        learner_name: learnerName,
        score: Math.round(avgScore * 100) / 100,
        skills,
        verification_code: verificationCode,
        issued_by: issuedBy,
        org_id: stage.org_id ?? null,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to create certificate',
        insertError?.message,
      );
    }

    const baseUrl = buildBaseUrl(request);
    return apiSuccess(
      { certificate: certificateFromRow(inserted as CertificateRow, baseUrl) },
      201,
    );
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to generate certificate',
      error instanceof Error ? error.message : String(error),
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildBaseUrl(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const host = request.headers.get('host') ?? 'qalem.example';
  return `${proto}://${host}`;
}
