import { type NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/certificates/verify/[code]
 *
 * Public endpoint — no authentication required.
 * Returns certificate details for verification, or 404.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;

    if (!code || code.length < 10) {
      return NextResponse.json(
        { success: false, error: 'Invalid verification code' },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data: cert, error } = await supabase
      .from('certificates')
      .select('id, course_name, learner_name, completion_date, score, skills, verification_code, issued_by')
      .eq('verification_code', code)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Verification lookup failed' },
        { status: 500 },
      );
    }

    if (!cert) {
      return NextResponse.json(
        { success: false, error: 'Certificate not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      verified: true,
      certificate: {
        courseName: cert.course_name,
        learnerName: cert.learner_name,
        completionDate: cert.completion_date,
        score: cert.score,
        skills: cert.skills ?? [],
        verificationCode: cert.verification_code,
        issuedBy: cert.issued_by,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Internal error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
