import { describe, expect, it, vi } from 'vitest';
import { PlaybackEngine } from '@/lib/playback/engine';

describe('resource_pause playback checkpoint', () => {
  it('requires an explicit resume before consuming the following action', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const onResourcePause = vi.fn();
    const onResourceResume = vi.fn();
    const engine = new PlaybackEngine(
      [
        {
          id: 'scene_1',
          type: 'slide',
          title: 'Resource',
          order: 1,
          content: {} as never,
          actions: [
            {
              id: 'pause_1',
              type: 'resource_pause',
              resourceId: 'resource_1',
              resourceTitle: 'Workbook',
              downloadUrl: '/r/c/resource_1/workbook.xlsx',
            },
            { id: 'focus_1', type: 'spotlight', elementId: 'title' },
          ],
        },
      ] as never,
      { execute, clearEffects: vi.fn() } as never,
      {
        stop: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        isPlaying: vi.fn().mockReturnValue(false),
        hasActiveAudio: vi.fn().mockReturnValue(false),
      } as never,
      { onResourcePause, onResourceResume },
    );

    engine.start();
    expect(engine.getMode()).toBe('paused');
    expect(onResourcePause).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();

    engine.resume();
    await Promise.resolve();
    expect(onResourceResume).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'spotlight', elementId: 'title' }),
    );
  });
});
