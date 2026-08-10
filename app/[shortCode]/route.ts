import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { classroomMediaContentType, isValidClassroomId } from '@/lib/server/classroom-storage';

interface ResourceShortLink {
  classroomId: string;
  resourceId: string;
  fileName: string;
}

function resourceExtension(fileName: string): 'xlsx' | 'docx' | null {
  const extension = fileName.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return extension === 'xlsx' || extension === 'docx' ? extension : null;
}

function isResourceShortLink(value: unknown): value is ResourceShortLink {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ResourceShortLink>;
  return (
    typeof candidate.classroomId === 'string' &&
    isValidClassroomId(candidate.classroomId) &&
    typeof candidate.resourceId === 'string' &&
    /^[a-zA-Z0-9_-]+$/.test(candidate.resourceId) &&
    typeof candidate.fileName === 'string' &&
    /^[a-zA-Z0-9._-]+\.(?:xlsx|docx)$/i.test(candidate.fileName) &&
    resourceExtension(candidate.fileName) !== null
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shortCode: string }> },
) {
  const { shortCode } = await params;
  if (!/^[a-zA-Z0-9]{5}$/.test(shortCode)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const bucket = createServiceSupabaseClient().storage.from('classroom-media');
  const { data: marker, error: markerError } = await bucket.download(
    `short-links/${shortCode}.json`,
  );
  if (markerError || !marker) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let metadata: unknown;
  try {
    metadata = JSON.parse(await marker.text());
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!isResourceShortLink(metadata)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const extension = resourceExtension(metadata.fileName);
  if (!extension) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data, error } = await bucket.download(
    `${metadata.classroomId}/resources/${metadata.resourceId}.${extension}`,
  );
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return new NextResponse(data, {
    headers: {
      'Content-Type': classroomMediaContentType(metadata.fileName),
      'Content-Length': String(data.size),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(metadata.fileName)}`,
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
