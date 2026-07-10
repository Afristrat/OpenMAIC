/**
 * API Route: Serve plugin scene files
 *
 * GET /api/plugins/scenes/:pluginId/index.html
 *
 * Reads the plugin's HTML file from the `plugins/scenes/` directory
 * and serves it with appropriate content-type headers. This allows
 * the plugin renderer iframe to load plugin content.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ALLOWED_EXTENSIONS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pluginId: string }> },
): Promise<NextResponse> {
  const { pluginId } = await params;

  // Validate pluginId to prevent path traversal
  if (!pluginId || /[./\\]/.test(pluginId)) {
    return NextResponse.json({ error: 'Invalid plugin ID' }, { status: 400 });
  }

  const pluginDir = path.join(process.cwd(), 'plugins', 'scenes', pluginId);

  if (!fs.existsSync(pluginDir)) {
    return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
  }

  // Default to index.html
  const filePath = path.join(pluginDir, 'index.html');
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ALLOWED_EXTENSIONS[ext];

  if (!contentType) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 403 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const content = fs.readFileSync(filePath);
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        // CSP for plugin iframes
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
          "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
          "connect-src 'self' https://cdn.jsdelivr.net",
          "frame-src 'none'",
          "img-src 'self' data: blob:",
        ].join('; '),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
