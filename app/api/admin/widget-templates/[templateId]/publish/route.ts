import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/api/auth';
import { widgetTemplateVersionSchema } from '@/lib/server/widget-template-admin';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ templateId: string }> },
): Promise<Response> {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;
  try {
    const { templateId } = await context.params;
    const { versionId } = widgetTemplateVersionSchema.parse(await request.json());
    const { data, error } = await createServiceSupabaseClient()
      .rpc('publish_widget_template', {
        actor_user_id: auth.user.id,
        target_template_id: templateId,
        target_version_id: versionId,
      })
      .single();
    if (error || !data) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to publish widget template');
    }
    return apiSuccess(data);
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid widget template publication');
  }
}
