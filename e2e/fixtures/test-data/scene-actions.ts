import { defaultTheme } from './scene-content';
import { mockOutlines } from './scene-outlines';
import type { SceneOutline } from '../../../lib/types/generation';

/** Mock response for POST /api/generate/scene-actions */
export function createMockSceneActionsResponse(
  stageId: string,
  outline: SceneOutline = mockOutlines[0],
) {
  const sceneSuffix = String(outline.order);
  return {
    success: true,
    scene: {
      id: `scene-${sceneSuffix}`,
      stageId,
      type: 'slide',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'slide',
        canvas: {
          id: `slide-${sceneSuffix}`,
          viewportSize: 1000,
          viewportRatio: 0.5625,
          theme: defaultTheme,
          elements: [
            {
              type: 'text',
              id: `title-el-${sceneSuffix}`,
              content: outline.title,
              left: 50,
              top: 50,
              width: 900,
              height: 100,
            },
          ],
        },
      },
      actions: [
        {
          id: `action-${sceneSuffix}`,
          type: 'speech',
          agent: 'teacher',
          text: outline.description,
        },
      ],
    },
    previousSpeeches: [],
  };
}
