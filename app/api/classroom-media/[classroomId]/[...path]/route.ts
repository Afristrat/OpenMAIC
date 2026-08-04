import { NextRequest, NextResponse } from 'next/server';
import {
  classroomMediaContentType,
  isClassroomPublic,
  isValidClassroomId,
  readClassroomOwnership,
} from '@/lib/server/classroom-storage';
import { requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ classroomId: string; path: string[] }> },
) {
  const { classroomId, path: pathSegments } = await params;

  // Validate classroomId
  if (!isValidClassroomId(classroomId)) {
    return NextResponse.json({ error: 'Invalid classroom ID' }, { status: 400 });
  }

  // Validate path segments — no traversal
  const joined = pathSegments.join('/');
  if (joined.includes('..') || pathSegments.some((s) => s.includes('\0'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Only allow the classroom's generated media, audio and learning resources.
  const subDir = pathSegments[0];
  if (subDir !== 'media' && subDir !== 'audio' && subDir !== 'resources') {
    return NextResponse.json({ error: 'Invalid path' }, { status: 404 });
  }

  // Scope media access to the classroom's own org — previously any
  // authenticated user could stream any classroom's media by guessing/knowing
  // its ID, regardless of org membership. Same authorization as GET /api/classroom.
  const ownership = await readClassroomOwnership(classroomId);
  if (!ownership) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!(await isClassroomPublic(classroomId))) {
    const auth = await requireSuperAdminOrOrgMember(req, ownership.orgId);
    if (auth.response) return auth.response;
  }

  const supabase = createServiceSupabaseClient();
  const { data: blob, error } = await supabase.storage
    .from('classroom-media')
    .download(`${classroomId}/${joined}`);

  if (error || !blob) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(blob, {
    status: 200,
    headers: {
      'Content-Type': classroomMediaContentType(joined),
      'Content-Length': String(blob.size),
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
