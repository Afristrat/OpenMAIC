import { describe, expect, it } from 'vitest';
import { trackingAdapters } from '@/lib/export/scorm/tracking-adapters';

function executeTrackingScript(windowLike: Record<string, unknown>, script: string): void {
  new Function('window', script)(windowLike);
}

describe('learning package tracking adapters at runtime', () => {
  it('initializes, records completion and terminates through the host SCORM 1.2 API', () => {
    const calls: string[][] = [];
    const api = {
      LMSInitialize: (value: string) => {
        calls.push(['initialize', value]);
        return 'true';
      },
      LMSSetValue: (key: string, value: string) => calls.push(['set', key, value]),
      LMSCommit: (value: string) => calls.push(['commit', value]),
      LMSFinish: (value: string) => calls.push(['finish', value]),
    };
    const lmsWindow = { API: api } as Record<string, unknown>;
    lmsWindow.parent = lmsWindow;
    const scoWindow = { parent: lmsWindow } as Record<string, unknown>;

    executeTrackingScript(scoWindow, trackingAdapters.scorm12.buildTrackingScript());
    const tracking = scoWindow.qalemTracking as {
      location(value: string): void;
      complete(): void;
      terminate(): void;
    };
    tracking.location('scene-2');
    tracking.complete();
    tracking.terminate();

    expect(calls).toEqual([
      ['initialize', ''],
      ['set', 'cmi.core.lesson_location', 'scene-2'],
      ['commit', ''],
      ['set', 'cmi.core.lesson_status', 'completed'],
      ['set', 'cmi.core.score.raw', '100'],
      ['commit', ''],
      ['finish', ''],
    ]);
  });

  it('initializes, records completion and terminates through the host SCORM 2004 API', () => {
    const calls: string[][] = [];
    const api = {
      Initialize: (value: string) => {
        calls.push(['initialize', value]);
        return 'true';
      },
      SetValue: (key: string, value: string) => calls.push(['set', key, value]),
      Commit: (value: string) => calls.push(['commit', value]),
      Terminate: (value: string) => calls.push(['terminate', value]),
    };
    const lmsWindow = { API_1484_11: api } as Record<string, unknown>;
    lmsWindow.parent = lmsWindow;
    const scoWindow = { parent: lmsWindow } as Record<string, unknown>;

    executeTrackingScript(scoWindow, trackingAdapters.scorm2004.buildTrackingScript());
    const tracking = scoWindow.qalemTracking as {
      location(value: string): void;
      complete(): void;
      terminate(): void;
    };
    tracking.location('scene-3');
    tracking.complete();
    tracking.terminate();

    expect(calls).toEqual([
      ['initialize', ''],
      ['set', 'cmi.location', 'scene-3'],
      ['commit', ''],
      ['set', 'cmi.completion_status', 'completed'],
      ['set', 'cmi.success_status', 'passed'],
      ['commit', ''],
      ['terminate', ''],
    ]);
  });

  it('uses the cmi5 launch contract and sends initialized, completed, then terminated statements', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const actor = JSON.stringify({
      objectType: 'Agent',
      account: { homePage: 'https://qalem.ma', name: 'learner-1' },
    });
    const windowLike = {
      location: {
        search: `?endpoint=${encodeURIComponent('https://lrs.example/xapi/')}&fetch=${encodeURIComponent('https://lms.example/fetch')}&actor=${encodeURIComponent(actor)}&registration=registration-1&activityId=${encodeURIComponent('https://qalem.ma/activity/1')}`,
      },
      crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
      fetch: async (url: string, init?: RequestInit) => {
        requests.push({ url, init });
        if (url === 'https://lms.example/fetch') {
          return { ok: true, json: async () => ({ 'auth-token': 'Bearer cmi5-token' }) };
        }
        if (url.startsWith('https://lrs.example/xapi/activities/state')) {
          return {
            ok: true,
            json: async () => ({
              launchMode: 'Normal',
              contextTemplate: { registration: 'registration-1' },
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      },
    } as Record<string, unknown>;

    executeTrackingScript(windowLike, trackingAdapters.cmi5.buildTrackingScript());
    const tracking = windowLike.qalemTracking as {
      complete(): Promise<void>;
      terminate(): Promise<void>;
    };
    await tracking.complete();
    await tracking.terminate();
    await tracking.terminate();

    const statementRequests = requests.filter(({ url }) =>
      url.startsWith('https://lrs.example/xapi/statements'),
    );
    expect(requests[0]).toMatchObject({
      url: 'https://lms.example/fetch',
      init: { method: 'POST' },
    });
    expect(requests[1]?.url).toContain('stateId=LMS.LaunchData');
    expect(statementRequests).toHaveLength(3);
    expect(statementRequests.map(({ init }) => JSON.parse(String(init?.body)).verb.id)).toEqual([
      'http://adlnet.gov/expapi/verbs/initialized',
      'http://adlnet.gov/expapi/verbs/completed',
      'http://adlnet.gov/expapi/verbs/terminated',
    ]);
    expect(statementRequests[2]?.init).toMatchObject({ keepalive: true });
    expect(
      statementRequests.every(
        ({ init }) =>
          (init?.headers as Record<string, string>).Authorization === 'Bearer cmi5-token',
      ),
    ).toBe(true);
  });
});
