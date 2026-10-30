import { describe, expect, test } from 'vitest';
import { latestVideoByStage } from '@/lib/courses/catalog-videos';

describe('latestVideoByStage', () => {
  test('keeps the most recent finished MP4 of each formation, whatever the row order', () => {
    const videos = latestVideoByStage([
      { id: 'old-a', stage_id: 'a', created_at: '2026-10-01T10:00:00Z' },
      { id: 'new-a', stage_id: 'a', created_at: '2026-10-20T10:00:00Z' },
      { id: 'only-b', stage_id: 'b', created_at: '2026-09-01T10:00:00Z' },
      { id: 'mid-a', stage_id: 'a', created_at: '2026-10-10T10:00:00Z' },
    ]);
    expect(videos.get('a')).toBe('new-a');
    expect(videos.get('b')).toBe('only-b');
    expect(videos.has('c')).toBe(false);
  });

  test('is empty without any export', () => {
    expect(latestVideoByStage([]).size).toBe(0);
  });
});
