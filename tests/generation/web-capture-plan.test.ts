import { describe, it, expect, vi } from 'vitest';
import { decideCaptureForScene } from '@/lib/generation/web-capture-plan';
import type { SceneOutline } from '@/lib/types/generation';

const outline: SceneOutline = {
  id: 'scene_1',
  type: 'slide',
  title: 'Configurer les clés virtuelles LiteLLM',
  description: 'Montrer comment créer une clé virtuelle dans le panel admin LiteLLM.',
  keyPoints: ['Panel /ui', 'Clés virtuelles', 'Budgets par clé'],
  order: 1,
};

describe('decideCaptureForScene', () => {
  it('parses a well-formed capture decision from the LLM', async () => {
    const aiCall = vi.fn().mockResolvedValue(
      JSON.stringify({
        needsCapture: true,
        url: 'https://proxy.ai-mpower.com/ui',
        interactionSteps: [{ action: 'click', selector: 'text=Virtual Keys' }],
        format: 'image',
        reason: 'La scène décrit la page des clés virtuelles.',
      }),
    );
    const decision = await decideCaptureForScene(outline, aiCall);
    expect(decision).toEqual({
      needsCapture: true,
      url: 'https://proxy.ai-mpower.com/ui',
      interactionSteps: [{ action: 'click', selector: 'text=Virtual Keys' }],
      format: 'image',
      reason: 'La scène décrit la page des clés virtuelles.',
    });
  });

  it('returns null when the LLM response is not valid JSON', async () => {
    const aiCall = vi.fn().mockResolvedValue('n\'importe quoi, pas du JSON');
    const decision = await decideCaptureForScene(outline, aiCall);
    expect(decision).toBeNull();
  });

  it('returns null when format is neither image nor video', async () => {
    const aiCall = vi.fn().mockResolvedValue(
      JSON.stringify({
        needsCapture: true,
        url: 'https://example.com',
        interactionSteps: [],
        format: 'pdf',
        reason: 'invalide',
      }),
    );
    const decision = await decideCaptureForScene(outline, aiCall);
    expect(decision).toBeNull();
  });

  it('returns a needsCapture:false decision as-is for a scene with no visual product to show', async () => {
    const aiCall = vi.fn().mockResolvedValue(
      JSON.stringify({
        needsCapture: false,
        url: '',
        interactionSteps: [],
        format: 'image',
        reason: "Scène conceptuelle sans outil concret à montrer.",
      }),
    );
    const decision = await decideCaptureForScene(outline, aiCall);
    expect(decision?.needsCapture).toBe(false);
  });
});
