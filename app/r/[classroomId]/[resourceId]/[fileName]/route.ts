import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  classroomMediaContentType,
  isClassroomPublic,
  isValidClassroomId,
  readClassroomOwnership,
} from '@/lib/server/classroom-storage';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ classroomId: string; resourceId: string; fileName: string }> },
) {
  const { classroomId, resourceId, fileName } = await params;
  if (!isValidClassroomId(classroomId) || !/^[a-zA-Z0-9_-]+$/.test(resourceId)) {
    return NextResponse.json({ error: 'Invalid resource' }, { status: 400 });
  }
  const extension = fileName.match(/\.(xlsx|docx)$/i)?.[1]?.toLowerCase();
  if (extension !== 'xlsx' && extension !== 'docx') {
    return NextResponse.json({ error: 'Invalid resource' }, { status: 400 });
  }
  const ownership = await readClassroomOwnership(classroomId);
  if (!ownership) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await isClassroomPublic(classroomId))) {
    const auth = await requireSuperAdminOrOrgMember(req, ownership.orgId);
    if (auth.response) return auth.response;
  }
  const { data, error } = await createServiceSupabaseClient()
    .storage.from('classroom-media')
    .download(`${classroomId}/resources/${resourceId}.${extension}`);
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const downloadName = fileName;
  return new NextResponse(data, {
    headers: {
      'Content-Type': classroomMediaContentType(downloadName),
      'Content-Length': String(data.size),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
