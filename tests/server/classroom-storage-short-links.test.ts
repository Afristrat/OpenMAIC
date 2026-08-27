import { describe, expect, it } from 'vitest';
import { shortLinkStoragePathsFromActions } from '@/lib/server/classroom-storage';

describe('classroom short-link cleanup', () => {
  it('extracts only unique Qalem resource checkpoints', () => {
    expect(
      shortLinkStoragePathsFromActions([
        { type: 'speech', text: 'Téléchargez le classeur.' },
        { type: 'resource_pause', downloadUrl: 'https://qalem.ma/A7bK2' },
        { type: 'resource_pause', downloadUrl: '/A7bK2' },
        { type: 'resource_pause', downloadUrl: '/too-long' },
        { type: 'resource_pause', downloadUrl: 'not a valid URL' },
      ]),
    ).toEqual(['short-links/A7bK2.json']);
  });

  it('returns no path for malformed action payloads', () => {
    expect(shortLinkStoragePathsFromActions(null)).toEqual([]);
    expect(shortLinkStoragePathsFromActions([null, {}, { type: 'resource_pause' }])).toEqual([]);
  });
});
