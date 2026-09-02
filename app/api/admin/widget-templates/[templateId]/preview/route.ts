import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/api/auth';
import {
  evaluateWidgetComposition,
  parseWidgetComposition,
} from '@/lib/plugins/widget-composition';
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
      .from('widget_template_versions')
      .select('id, template_id, version_number, composition')
      .eq('template_id', templateId)
      .eq('id', versionId)
      .single();
    if (error || !data) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Widget template version not found');
    }
    const composition = parseWidgetComposition(data.composition);
    return apiSuccess({
      version: data,
      evaluation: evaluateWidgetComposition(composition, {}),
    });
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid widget template preview');
  }
}
