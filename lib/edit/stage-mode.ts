import { PENDING_SCENE_ID } from '@/lib/store/stage';
import type { SceneType } from '@/lib/types/stage';

/**
 * Inputs the edit-mode auto-exit guard reads. Kept as primitives so callers
 * can derive the values cheaply without holding full Scene / SceneOutline
 * objects, and so the predicate is trivially testable without rendering Stage.
 */
export interface StageEditModeContext {
  currentSceneId: string | null;
  sceneCount: number;
  generatingOutlineCount: number;
  hasCurrentScene: boolean;
  sceneType?: SceneType;
  canPersist?: boolean;
}

/**
 * Whether edit mode should remain active for the given stage state.
 * Returns false in cases that would otherwise strand the user in an empty
 * edit shell — pending scene, no scenes, generation in flight, or no current
 * scene resolved yet.
 */
export function isCurrentSceneEditable(ctx: StageEditModeContext): boolean {
  if (ctx.canPersist === false) return false;
  if (ctx.sceneType && ctx.sceneType !== 'slide' && ctx.sceneType !== 'quiz') return false;
  if (ctx.currentSceneId === PENDING_SCENE_ID) return false;
  if (ctx.sceneCount === 0) return false;
  if (ctx.generatingOutlineCount > 0) return false;
  if (!ctx.hasCurrentScene) return false;
  return true;
}
