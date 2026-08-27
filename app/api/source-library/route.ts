import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { requireSuperAdminOrOrgAuthor, requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { validateBody } from '@/lib/api/validate';
import {
  ingestOrganizationSource,
  listOrganizationSources,
} from '@/lib/server/formation-source-library';

const orgIdSchema = z.string().uuid();
const sourceContentSchema = z.object({
  text: z.string().max(5_000_000),
  images: z
    .array(
      z.union([
        z.string(),
        z.object({
          id: z.string().min(1).max(120),
          src: z.string(),
          pageNumber: z.number().int().nonnegative(),
          description: z.string().max(2000).optional(),
          storageId: z.string().max(240).optional(),
          width: z.number().positive().optional(),
          height: z.number().positive().optional(),
        }),
      ]),
    )
    .max(200)
    .default([]),
});
const ingestSourceSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().trim().min(1).max(260),
  mimeType: z.string().trim().min(1).max(160),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(50 * 1024 * 1024),
  parserId: z.string().trim().min(1).max(80),
  content: sourceContentSchema,
});

export async function GET(request: NextRequest) {
  const parsedOrgId = orgIdSchema.safeParse(request.nextUrl.searchParams.get('orgId'));
  if (!parsedOrgId.success) {
    return NextResponse.json({ error: 'A valid orgId is required' }, { status: 400 });
  }
  const auth = await requireSuperAdminOrOrgMember(request, parsedOrgId.data);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({
      success: true,
      sources: await listOrganizationSources(parsedOrgId.data),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list sources' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const validation = validateBody(ingestSourceSchema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;
  const auth = await requireSuperAdminOrOrgAuthor(request, validation.data.orgId);
  if (auth.response) return auth.response;
  try {
    const result = await ingestOrganizationSource({
      orgId: validation.data.orgId,
      ownerId: auth.user.id,
      name: validation.data.name,
      mimeType: validation.data.mimeType,
      sizeBytes: validation.data.sizeBytes,
      parserId: validation.data.parserId,
      content: validation.data.content,
    });
    return NextResponse.json(
      { success: true, ...result },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'SOURCE_TEXT_EMPTY') {
      return NextResponse.json(
        { error: 'The document contains no readable text', code: 'SOURCE_REJECTED' },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to persist source' },
      { status: 500 },
    );
  }
}
