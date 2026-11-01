import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CourseNotificationPreferences } from '@/components/courses/course-notification-preferences';

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({ locale: 'fr-FR', t: (key: string) => key }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('CourseNotificationPreferences layout', () => {
  const html = renderToStaticMarkup(
    createElement(CourseNotificationPreferences, { courseId: 'c1' }),
  );

  it('never sits in the top corner where the header buttons are', () => {
    expect(html).not.toMatch(/\btop-3\b/);
    expect(html).toContain('fixed bottom-20 end-3');
  });

  it('starts closed as a single labelled button, without the preferences form', () => {
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="notifications.courseTitle"');
    expect(html).not.toContain('notifications.savePreferences');
    expect(html).not.toContain('role="dialog"');
  });
});
