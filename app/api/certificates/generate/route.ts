import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  generateVerificationCode,
  certificateFromRow,
  meetsScoreThreshold,
  type CertificateRow,
} from '@/lib/certificates';
import { validateBody } from '@/lib/api/validate';
import { certificateGenerateSchema } from '@/lib/api/schemas';
import { readReportPages } from '@/lib/reports/read-report-pages';
import { LtiAccessDenied, resolveLtiContext } from '@/lib/lti/context';

/**
 * POST /api/certificates/generate
 *
 * Generate a certificate for a learner who completed a classroom stage.
 *
 * Body: { stageId: string, orgId: string | null }
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
    const rawBody = await request.json();
    const validation = validateBody(certificateGenerateSchema, rawBody);
    if (!validation.success) return validation.response;
    const { stageId } = validation.data;
    const launchToken = request.cookies.get('lti_context')?.value;
    const orgId = launchToken
      ? (await resolveLtiContext({ token: launchToken, userId: user.id, stageId })).orgId
      : validation.data.orgId;
    const signal = AbortSignal.timeout(30000);
    const lookupCertificate = () => {
      const query = supabase
        .from('certificates')
        .select('*')
        .eq('user_id', user.id)
        .eq('stage_id', stageId);
      return (
        orgId ? query.eq('issuance_org_id', orgId) : query.is('issuance_org_id', null)
      ).maybeSingle();
    };

    // --- Check if certificate already exists ----------------------------
    const { data: existing, error: lookupError } = await lookupCertificate();
    if (lookupError) throw new Error('Certificate lookup unavailable');

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

    let issuedBy = 'Qalem';
    if (orgId) {
      const { data: membership, error: memberError } = await supabase
        .from('org_members')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (memberError) throw new Error('Membership unavailable');
      if (!membership) return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Organization denied');
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('name, status')
        .eq('id', orgId)
        .single();
      if (orgError) throw new Error('Organization unavailable');
      if (!org || org.status !== 'active')
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Organization inactive');
      issuedBy = org.name;
      if (stage.org_id !== orgId) {
        const { data: shared, error: sharedError } = await supabase
          .from('shared_classrooms')
          .select('id')
          .eq('authorization_verified', true)
          .eq('stage_id', stageId)
          .eq('org_id', orgId)
          .in('visibility', ['organization', 'public'])
          .maybeSingle();
        if (sharedError) throw new Error('Sharing unavailable');
        if (!shared) return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Stage tenant denied');
      }
    } else if (stage.org_id !== null) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Organization required for this stage');
    }

    // --- Fetch all scenes for this stage --------------------------------
    const scenes: Array<{ id: string; type: string; title: string | null }> = [];
    for await (const scene of readReportPages((from, to) =>
      supabase
        .from('scenes')
        .select('id, type, title', { count: 'exact' })
        .eq('stage_id', stageId)
        .order('id')
        .range(from, to)
        .abortSignal(signal),
    ))
      scenes.push(scene);

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

    const resultsByScene = new Map<string, number | null>();
    for (let offset = 0; offset < quizSceneIds.length; offset += 100) {
      const ids = quizSceneIds.slice(offset, offset + 100);
      for await (const result of readReportPages((from, to) => {
        const query = supabase
          .from('quiz_results')
          .select('scene_id, score', { count: 'exact' })
          .eq('user_id', user.id)
          .eq('stage_id', stageId)
          .in('scene_id', ids);
        return (orgId ? query.eq('org_id', orgId) : query.is('org_id', null))
          .order('completed_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
          .abortSignal(signal);
      }))
        if (!resultsByScene.has(result.scene_id)) resultsByScene.set(result.scene_id, result.score);
    }
    const quizResults = [...resultsByScene].map(([scene_id, score]) => ({ scene_id, score }));

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
      const s = result.score;
      if (s !== null && Number.isFinite(s) && s >= 0 && s <= 100) {
        totalScore += s;
        count += 1;
      }
    }
    if (count !== quizSceneIds.length)
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'A quiz score is unavailable');

    const avgScore = count > 0 ? totalScore / count : 0;

    if (!meetsScoreThreshold(avgScore)) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        `Quiz score ${Math.round(avgScore)}% is below the required 60% threshold`,
      );
    }

    // --- Learner profile ------------------------------------------------
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('nickname')
      .eq('id', user.id)
      .single();
    if (profileError) throw new Error('Profile unavailable');

    const learnerName = profile?.nickname || user.email || 'Learner';

    // --- Skills from scene titles (quiz & interactive) ------------------
    const skills = scenes
      .filter((s) => s.type === 'quiz' || s.type === 'interactive')
      .map((s) => s.title)
      .filter((title): title is string => typeof title === 'string' && title.length > 0);

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
        org_id: orgId,
      })
      .select()
      .single();

    if (insertError?.code === '23505') {
      const { data: concurrent, error: concurrentError } = await lookupCertificate();
      if (concurrentError) throw new Error('Certificate lookup unavailable');

      if (concurrent) {
        const baseUrl = buildBaseUrl(request);
        return apiSuccess({
          certificate: certificateFromRow(concurrent as CertificateRow, baseUrl),
          alreadyExisted: true,
        });
      }
    }

    if (insertError || !inserted) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to create certificate');
    }

    const baseUrl = buildBaseUrl(request);
    return apiSuccess(
      { certificate: certificateFromRow(inserted as CertificateRow, baseUrl) },
      201,
    );
  } catch (error) {
    if (error instanceof LtiAccessDenied)
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'LTI launch denied');
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to generate certificate');
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
