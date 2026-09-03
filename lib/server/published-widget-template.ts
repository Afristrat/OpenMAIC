import { z } from 'zod';
import { parseWidgetComposition, type WidgetComposition } from '@/lib/plugins/widget-composition';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const identifierSchema = z.string().uuid();

export interface PublishedWidgetTemplate {
  templateId: string;
  versionId: string;
  composition: WidgetComposition;
}

export async function loadPublishedWidgetTemplate(
  templateId: string,
  versionId: string,
): Promise<PublishedWidgetTemplate | null> {
  const safeTemplateId = identifierSchema.parse(templateId);
  const safeVersionId = identifierSchema.parse(versionId);
  const supabase = createServiceSupabaseClient();
  const { data: template, error: templateError } = await supabase
    .from('widget_templates')
    .select('published_version_id')
    .eq('id', safeTemplateId)
    .single();
  if (templateError || template?.published_version_id !== safeVersionId) return null;

  const { data: version, error: versionError } = await supabase
    .from('widget_template_versions')
    .select('composition')
    .eq('id', safeVersionId)
    .eq('template_id', safeTemplateId)
    .not('published_at', 'is', null)
    .single();
  if (versionError || !version) return null;

  try {
    return {
      templateId: safeTemplateId,
      versionId: safeVersionId,
      composition: parseWidgetComposition(version.composition),
    };
  } catch {
    return null;
  }
}
