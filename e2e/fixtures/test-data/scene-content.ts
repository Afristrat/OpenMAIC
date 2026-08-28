import type { SlideTheme } from '@openmaic/dsl';
import type { SceneOutline } from '../../../lib/types/generation';
import { mockOutlines } from './scene-outlines';

/** Default theme matching @openmaic/dsl SlideTheme */
const defaultTheme: SlideTheme = {
  backgroundColor: '#ffffff',
  themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
  fontColor: '#333333',
  fontName: 'Microsoft Yahei',
};

/** Mock response for POST /api/generate/scene-content */
export function createMockSceneContentResponse(outline: SceneOutline = mockOutlines[0]!) {
  const sceneSuffix = String(outline.order);
  return {
    success: true,
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
    effectiveOutline: outline,
  };
}

export { defaultTheme };
