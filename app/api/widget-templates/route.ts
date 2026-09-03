import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { parseWidgetComposition } from '@/lib/plugins/widget-composition';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface PublishedTemplateRow {
  id: string;
  title: string;
  published_version_id: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const supabase = await createServerSupabaseClient();
  const { data: templates, error: templateError } = await supabase
    .from('widget_templates')
    .select('id, title, published_version_id')
    .not('published_version_id', 'is', null)
    .order('title');
  if (templateError) {
    return NextResponse.json({ error: 'Failed to list widget templates' }, { status: 500 });
  }

  const rows = (templates ?? []) as PublishedTemplateRow[];
  const versionIds = rows.map((template) => template.published_version_id);
  if (versionIds.length === 0) return NextResponse.json({ templates: [] });

  const { data: versions, error: versionError } = await supabase
    .from('widget_template_versions')
    .select('id, version_number, composition')
    .in('id', versionIds);
  if (versionError) {
    return NextResponse.json({ error: 'Failed to list widget template versions' }, { status: 500 });
  }
  const versionById = new Map((versions ?? []).map((version) => [version.id, version]));
  const published = rows.flatMap((template) => {
    const version = versionById.get(template.published_version_id);
    if (!version) return [];
    try {
      const composition = parseWidgetComposition(version.composition);
      return [
        {
          templateId: template.id,
          versionId: version.id,
          versionNumber: version.version_number,
          title: template.title,
          locale: composition.locale,
        },
      ];
    } catch {
      return [];
    }
  });
  return NextResponse.json({ templates: published });
}
