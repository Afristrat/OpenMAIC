import { test, expect } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const STAGE_ID = 'e2e-team-of-the-day';
const SETTINGS_STORAGE = createSettingsStorage({ sidebarCollapsed: false });

async function seedClassroom(page: import('@playwright/test').Page, locale: 'fr-FR' | 'ar-MA') {
  await page.addInitScript(
    ({ settings, activeLocale }) => {
      localStorage.setItem('settings-storage', settings);
      localStorage.setItem('locale', activeLocale);
    },
    { settings: SETTINGS_STORAGE, activeLocale: locale },
  );
  await page.goto('/app', { waitUntil: 'networkidle' });
  await page.evaluate((stageId) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('MAIC-Database');
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const tx = db.transaction(['stages', 'scenes', 'stageOutlines'], 'readwrite');
        const now = Date.now();
        tx.objectStore('stages').put({
          id: stageId,
          name: 'Équipe du jour',
          style: 'interactive',
          generatedAgentConfigs: [
            {
              id: 'persona-professor',
              name: 'Younes',
              role: 'teacher',
              persona: 'Enseignant principal.',
              avatar: '/avatars/teacher.png',
              color: '#3b82f6',
              priority: 7,
              mechanismId: 'professor',
              gender: 'male',
              voiceConfig: { providerId: 'higgs-tts', voiceId: 'younes' },
            },
            {
              id: 'persona-coach',
              name: 'Hanae',
              role: 'assistant',
              persona: 'Coach.',
              avatar: '/avatars/teacher-2.png',
              color: '#f43f5e',
              priority: 6,
              mechanismId: 'coach',
              gender: 'female',
              voiceConfig: { providerId: 'higgs-tts', voiceId: 'hanae' },
            },
          ],
          createdAt: now,
          updatedAt: now,
        });
        tx.objectStore('scenes').put({
          id: 'e2e-team-scene',
          stageId,
          type: 'slide',
          title: 'Bienvenue',
          order: 0,
          content: { type: 'slide', canvas: { id: 'slide-1', elements: [] } },
          actions: [],
          createdAt: now,
          updatedAt: now,
        });
        tx.objectStore('stageOutlines').put({
          stageId,
          outlines: [],
          createdAt: now,
          updatedAt: now,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, STAGE_ID);
}

for (const { locale, label, coachRole } of [
  { locale: 'fr-FR' as const, label: 'Votre équipe du jour', coachRole: 'La Coach' },
  { locale: 'ar-MA' as const, label: 'فريقك اليوم', coachRole: 'المدرّبة' },
]) {
  test(`affiche l'équipe de session en ${locale}`, async ({ page, mockApi }) => {
    await seedClassroom(page, locale);
    const classroomApi = await mockApi.mockLocalClassroomFallback(STAGE_ID);
    await page.goto(`/classroom/${STAGE_ID}`);

    await page.getByRole('button', { name: label }).click();
    await expect(page.getByRole('list', { name: label })).toContainText('Younes');
    await expect(page.getByRole('list', { name: label })).toContainText('Hanae');
    await expect(page.getByRole('list', { name: label })).toContainText(coachRole);
    expect(classroomApi.expectedRequests).toEqual([`GET /api/classroom?id=${STAGE_ID}`]);
    expect(classroomApi.unexpectedRequests).toEqual([]);
  });
}
