import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  ClassroomOrganizationContext,
  useClassroomOrganizationId,
} from '@/lib/contexts/classroom-organization';

function Consumer() {
  return createElement('span', null, useClassroomOrganizationId() ?? 'none');
}
afterEach(() => vi.unstubAllGlobals());
it('keeps the classroom tenant local to its subtree instead of the browser selection', () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', { getItem: () => 'stale-browser-tenant' });
  expect(
    renderToStaticMarkup(
      createElement(
        ClassroomOrganizationContext.Provider,
        { value: 'verified-recipient' },
        createElement(Consumer),
      ),
    ),
  ).toBe('<span>verified-recipient</span>');
  expect(
    renderToStaticMarkup(
      createElement(
        ClassroomOrganizationContext.Provider,
        { value: null },
        createElement(Consumer),
      ),
    ),
  ).toBe('<span>none</span>');
  expect(renderToStaticMarkup(createElement(Consumer))).toBe('<span>stale-browser-tenant</span>');
});
