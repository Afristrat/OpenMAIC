/**
 * Type definitions for the generation pipeline.
 */

import type { GenerationProgress } from '@/lib/types/generation';

// ==================== Agent Info ====================

/** Lightweight agent info passed to the generation pipeline */
export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  persona?: string;
}

// ==================== Cross-Page Context ====================

/** Cross-page context for maintaining speech coherence across scenes */
export interface SceneGenerationContext {
  pageIndex: number; // Current page (1-based)
  totalPages: number; // Total number of pages
  allTitles: string[]; // All page titles in order
  previousSpeeches: string[]; // Speech texts from the previous page only
}

// ==================== Generated Slide Data Interface ====================

/**
 * AI-generated slide data structure
 * Used to parse AI responses
 */
export interface GeneratedSlideData {
  elements: Array<{
    type: 'text' | 'image' | 'video' | 'shape' | 'chart' | 'latex' | 'line';
    left: number;
    top: number;
    width: number;
    height: number;
    [key: string]: unknown;
  }>;
  background?: {
    type: 'solid' | 'gradient';
    color?: string;
    gradient?: {
      type: 'linear' | 'radial';
      colors: Array<{ pos: number; color: string }>;
      rotate: number;
    };
  };
  remark?: string;
}

// ==================== Types ====================

export interface GenerationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface GenerationCallbacks {
  onProgress?: (progress: GenerationProgress) => void;
  onStageComplete?: (stage: 1 | 2 | 3, result: unknown) => void;
  onError?: (error: string) => void;
}

export type AICallFn = (
  systemPrompt: string,
  userPrompt: string,
  images?: Array<{ id: string; src: string }>,
) => Promise<string>;

export type DesignEventRecorder = (event: {
  sceneId: string;
  eventType: 'lint_issue' | 'layout_fallback';
  ruleId?: string;
}) => Promise<void>;

const aiCallSceneIds = new WeakMap<AICallFn, string>();
const aiCallDesignEventRecorders = new WeakMap<AICallFn, DesignEventRecorder>();

export function setAICallSceneId(aiCall: AICallFn, sceneId: string): void {
  aiCallSceneIds.set(aiCall, sceneId);
}

export function getAICallSceneId(aiCall: AICallFn): string | undefined {
  return aiCallSceneIds.get(aiCall);
}

export function setAICallDesignEventRecorder(
  aiCall: AICallFn,
  recorder: DesignEventRecorder | undefined,
): void {
  if (recorder) aiCallDesignEventRecorders.set(aiCall, recorder);
  else aiCallDesignEventRecorders.delete(aiCall);
}

export function getAICallDesignEventRecorder(aiCall: AICallFn): DesignEventRecorder | undefined {
  return aiCallDesignEventRecorders.get(aiCall);
}
