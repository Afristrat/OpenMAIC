import { describe, it, expect, vi } from 'vitest';
import { expectConsoleMessages } from '@/tests/helpers/expected-console';
import { decideCaptureForScene } from '@/lib/generation/web-capture-plan';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import type { SceneOutline } from '@/lib/types/generation';

vi.mock('@/lib/server/ssrf-guard', () => ({
  validateUrlForSSRF: vi.fn(),
}));

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
    expectConsoleMessages({
      warn: [
        /^\[WARN\] \[Generation\] Attempt 1 parse error:/,
        /^\[WARN\] \[Generation\] Attempt 2 parse error:/,
        /^\[WARN\] \[Generation\] Attempt 3 parse error at position 1:/,
        /^\[WARN\] \[Generation\] Attempt 4 parse error:/,
      ],
      error: [
        '[ERROR] [Generation] Failed to parse JSON from response',
        "[ERROR] [Generation] Raw response (first 500 chars): n'importe quoi, pas du JSON",
        "[ERROR] [Generation] Raw response (last 500 chars): n'importe quoi, pas du JSON",
        '[ERROR] [WebCapturePlan] Failed to parse capture-decision response for: Configurer les clés virtuelles LiteLLM',
      ],
    });
    const aiCall = vi.fn().mockResolvedValue("n'importe quoi, pas du JSON");
    const decision = await decideCaptureForScene(outline, aiCall);
    expect(decision).toBeNull();
  });

  it('returns null when format is neither image nor video', async () => {
    expectConsoleMessages({
      error: [
        '[ERROR] [WebCapturePlan] Failed to parse capture-decision response for: Configurer les clés virtuelles LiteLLM',
      ],
    });
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
        reason: 'Scène conceptuelle sans outil concret à montrer.',
      }),
    );
    const decision = await decideCaptureForScene(outline, aiCall);
    expect(decision?.needsCapture).toBe(false);
  });
});

describe('decideCaptureForScene — ssrf-guard', () => {
  it('downgrades needsCapture to false when ssrf-guard rejects the URL', async () => {
    expectConsoleMessages({
      warn: [
        '[WARN] [WebCapturePlan] capture-decision URL rejected by ssrf-guard for "Configurer les clés virtuelles LiteLLM": Only HTTP(S) URLs are allowed',
      ],
    });
    vi.mocked(validateUrlForSSRF).mockResolvedValue('Only HTTP(S) URLs are allowed');
    const aiCall = vi.fn().mockResolvedValue(
      JSON.stringify({
        needsCapture: true,
        url: 'file:///etc/passwd',
        interactionSteps: [],
        format: 'image',
        reason: 'proposition invalide',
      }),
    );
    const decision = await decideCaptureForScene(outline, aiCall);
    expect(decision?.needsCapture).toBe(false);
    expect(decision?.reason).toContain('rejetée par ssrf-guard');
  });

  it('keeps needsCapture:true when ssrf-guard accepts the URL', async () => {
    vi.mocked(validateUrlForSSRF).mockResolvedValue(null);
    const aiCall = vi.fn().mockResolvedValue(
      JSON.stringify({
        needsCapture: true,
        url: 'https://proxy.ai-mpower.com/ui',
        interactionSteps: [],
        format: 'image',
        reason: 'ok',
      }),
    );
    const decision = await decideCaptureForScene(outline, aiCall);
    expect(decision?.needsCapture).toBe(true);
  });
});
