import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/api/auth';
import {
  createWidgetTemplateSchema,
  validateComposition,
} from '@/lib/server/widget-template-admin';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;
  try {
    const input = createWidgetTemplateSchema.parse(await request.json());
    const composition = validateComposition(input.composition);
    const { data, error } = await createServiceSupabaseClient()
      .rpc('create_widget_template', {
        actor_user_id: auth.user.id,
        template_slug: input.slug,
        template_title: input.title,
        template_composition: composition,
      })
      .single();
    if (error || !data) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to create widget template',
      );
    }
    return apiSuccess(data, 201);
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid widget template');
  }
}
