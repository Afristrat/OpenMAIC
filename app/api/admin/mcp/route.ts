import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/api/auth';
import { getMCPHealth } from '@/lib/mcp/runtime';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;
  try {
    const servers = await getMCPHealth();
    const response = apiSuccess({ servers });
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return response;
  } catch {
    return apiError(API_ERROR_CODES.UPSTREAM_ERROR, 502, 'MCP health check unavailable');
  }
}
