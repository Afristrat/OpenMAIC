import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { requireSuperAdminOrOrgAuthor, requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { validateBody } from '@/lib/api/validate';
import {
  readLatestSourceManifest,
  replaceSourceManifest,
} from '@/lib/server/formation-source-library';

const orgIdSchema = z.string().uuid();
const replaceManifestSchema = z.object({
  orgId: z.string().uuid(),
  sourceIds: z
    .array(z.string().uuid())
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Source identifiers must be unique',
    }),
  expectedVersion: z.number().int().nonnegative().optional(),
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
      manifest: await readLatestSourceManifest(parsedOrgId.data, auth.user.id),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read source manifest' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const validation = validateBody(replaceManifestSchema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;
  const auth = await requireSuperAdminOrOrgAuthor(request, validation.data.orgId);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({
      success: true,
      manifest: await replaceSourceManifest({
        orgId: validation.data.orgId,
        ownerId: auth.user.id,
        sourceIds: validation.data.sourceIds,
        expectedVersion: validation.data.expectedVersion,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to replace source manifest';
    const status = /version conflict/i.test(message)
      ? 409
      : /unique|selected source/i.test(message)
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
