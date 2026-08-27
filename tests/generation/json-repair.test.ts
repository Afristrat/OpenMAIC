import { describe, expect, it } from 'vitest';
import { expectConsoleMessages } from '@/tests/helpers/expected-console';

import { parseJsonResponse } from '@/lib/generation/json-repair';

describe('json-repair targeted fixes', () => {
  it('repairs quoted key-value fragments such as "height: 76"', () => {
    expectConsoleMessages({
      warn: [/^\[WARN\] \[Generation\] Attempt 1 parse error at position 212:/],
    });
    const raw = `{
  "background": {
    "type": "solid",
    "color": "#ffffff"
  },
  "elements": [
    {
      "id": "code_text",
      "type": "text",
      "left": 80,
      "top": 420,
      "width": 840,
      "height: 76",
      "content": "<p style=\\"font-size: 22px;\\">age = 25</p>",
      "defaultFontName": "",
      "defaultColor": "#333333"
    }
  ]
}`;

    const parsed = parseJsonResponse<{
      elements: Array<{ height: number; content: string }>;
    }>(raw);

    expect(parsed).not.toBeNull();
    expect(parsed?.elements[0]?.height).toBe(76);
    expect(parsed?.elements[0]?.content).toContain('age = 25');
  });

  it('repairs boolean property fragments without touching valid string values', () => {
    expectConsoleMessages({
      warn: [/^\[WARN\] \[Generation\] Attempt 1 parse error at position 72:/],
    });
    const raw = `{
  "elements": [
    {
      "id": "shape_1",
      "fixedRatio: false",
      "height: 58",
      "content": "<p>literal text: height: 58</p>"
    }
  ]
}`;

    const parsed = parseJsonResponse<{
      elements: Array<{ fixedRatio: boolean; height: number; content: string }>;
    }>(raw);

    expect(parsed).not.toBeNull();
    expect(parsed?.elements[0]?.fixedRatio).toBe(false);
    expect(parsed?.elements[0]?.height).toBe(58);
    expect(parsed?.elements[0]?.content).toBe('<p>literal text: height: 58</p>');
  });
});
