import { isFeatureEnabled } from '@/lib/flags';
import { apiSuccess } from '@/lib/server/api-response';

export async function GET() {
  return apiSuccess({ enabled: await isFeatureEnabled('anchoring') });
}
