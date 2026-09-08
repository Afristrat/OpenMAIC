import { marketplaceDraftSchema } from './draft-schema';
import { createAgentFromTemplate } from '@/lib/orchestration/registry/types';

/** Both marketplace entry points consume the same validated, complete snapshot. */
export function importMarketplaceAgent(configuration: unknown, id: string) {
  const parsed = marketplaceDraftSchema.shape.agent.safeParse(configuration);
  if (!parsed.success) return null;
  return createAgentFromTemplate(
    { ...parsed.data, avatar: parsed.data.avatar ?? '/avatars/teacher.png' },
    id,
  );
}
