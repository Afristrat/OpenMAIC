import { describe, expect, test } from 'vitest';
import { createDefaultContent } from '@/lib/api/stage-api-defaults';

describe('stage API plugin defaults', () => {
  test('creates a valid default content envelope for plugin scenes', () => {
    expect(createDefaultContent('plugin')).toEqual({
      type: 'plugin',
      pluginType: '',
      data: {},
    });
  });
});
