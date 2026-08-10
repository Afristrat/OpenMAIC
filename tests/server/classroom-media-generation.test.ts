import { beforeEach, describe, expect, test, vi } from 'vitest';

const storageUpload = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    storage: {
      from: () => ({ upload: storageUpload }),
    },
  }),
}));

import {
  replaceMediaPlaceholders,
  selectClassroomImageProvider,
  selectClassroomImageModel,
  uploadClassroomMedia,
} from '@/lib/server/classroom-media-generation';
import type { Scene } from '@/lib/types/stage';

function slideScene(
  elements: Array<{ id: string; type: string; src?: string; mediaRef?: string }>,
) {
  return {
    id: 'scene_1',
    stageId: 'stage_1',
    type: 'slide',
    title: 'Scene',
    order: 1,
    content: {
      type: 'slide',
      canvas: {
        id: 'canvas_1',
        elements,
      },
    },
  } as unknown as Scene;
}

describe('classroom media placeholder replacement', () => {
  beforeEach(() => {
    storageUpload.mockReset();
  });

  test('preserves direct video src when mediaRef is also present', () => {
    const scene = slideScene([
      {
        id: 'video_1',
        type: 'video',
        src: 'https://example.com/direct.mp4',
        mediaRef: 'gen_vid_real123',
      },
    ]);

    replaceMediaPlaceholders([scene], {
      gen_vid_real123: 'https://cdn.example.com/generated.mp4',
    });

    const content = scene.content as {
      canvas: { elements: Array<{ src?: string }> };
    };
    const video = content.canvas.elements[0];
    expect(video.src).toBe('https://example.com/direct.mp4');
  });
});

describe('classroom media upload reliability', () => {
  beforeEach(() => {
    storageUpload.mockReset();
  });

  test('retries only the idempotent upload after a transient network failure', async () => {
    vi.useFakeTimers();
    storageUpload
      .mockResolvedValueOnce({ error: new Error('fetch failed') })
      .mockResolvedValueOnce({ error: null });

    const upload = uploadClassroomMedia('classroom-1', 'media/generated.png', Buffer.from('png'));
    try {
      await vi.runAllTimersAsync();
      await expect(upload).resolves.toBeUndefined();
      expect(storageUpload).toHaveBeenCalledTimes(2);
      expect(storageUpload).toHaveBeenLastCalledWith(
        'classroom-1/media/generated.png',
        expect.any(Buffer),
        expect.objectContaining({ upsert: true }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test('does not retry a permanent authorization failure', async () => {
    storageUpload.mockResolvedValue({ error: { message: 'Unauthorized', statusCode: 401 } });

    await expect(
      uploadClassroomMedia('classroom-1', 'media/generated.png', Buffer.from('png')),
    ).rejects.toThrow('Unauthorized');
    expect(storageUpload).toHaveBeenCalledTimes(1);
  });
});

describe('classroom image model selection', () => {
  test('prefers the server-certified model over the provider default', () => {
    expect(
      selectClassroomImageModel('openai-image', {
        'openai-image': { models: ['gemini-3.1-flash-image'] },
      }),
    ).toBe('gemini-3.1-flash-image');
  });

  test('preserves the exact author selection when it is administered', () => {
    expect(
      selectClassroomImageModel(
        'openai-image',
        {
          'openai-image': {
            models: ['gemini-3.1-flash-image', 'future-administered-image-model'],
          },
        },
        'future-administered-image-model',
      ),
    ).toBe('future-administered-image-model');
  });

  test('rejects an unadministered client model and falls back to the first administered model', () => {
    expect(
      selectClassroomImageModel(
        'openai-image',
        { 'openai-image': { models: ['gemini-3.1-flash-image'] } },
        'client-injected-model',
      ),
    ).toBe('gemini-3.1-flash-image');
  });

  test('preserves the selected administered provider', () => {
    expect(
      selectClassroomImageProvider(
        {
          'openai-image': { models: ['gemini-3.1-flash-image'] },
          'qwen-image': { models: ['qwen-image-max'] },
        },
        'qwen-image',
      ),
    ).toBe('qwen-image');
  });
});
