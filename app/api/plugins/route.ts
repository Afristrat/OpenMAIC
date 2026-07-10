import { NextRequest, NextResponse } from 'next/server';
import { loadPlugins } from '@/lib/plugins/loader';
import { getPluginPublicPath } from '@/lib/plugins/loader';

/**
 * GET /api/plugins?locale=fr-FR
 *
 * Returns all registered scene plugins with localized metadata.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const locale = req.nextUrl.searchParams.get('locale') ?? 'fr-FR';
  const lang = locale.split('-')[0];

  const plugins = loadPlugins();

  const data = plugins.map((plugin) => {
    const name = plugin.name[lang] ?? plugin.name['fr'] ?? plugin.name['en'] ?? plugin.id;
    const description =
      plugin.description[lang] ?? plugin.description['fr'] ?? plugin.description['en'] ?? '';

    // Determine display type
    const pluginType = plugin.type.includes('code') ? 'Code' : 'Simulation 3D';

    return {
      id: plugin.id,
      type: plugin.type,
      name,
      description,
      version: plugin.version,
      author: plugin.author,
      icon: plugin.icon ?? 'Puzzle',
      displayType: pluginType,
      renderUrl: `${getPluginPublicPath(plugin.id)}/${plugin.renderUrl}`,
      width: plugin.width,
      height: plugin.height,
      supportedActions: plugin.supportedActions ?? [],
    };
  });

  return NextResponse.json({ success: true, plugins: data });
}
