import type { Page } from '@playwright/test';

type ConsoleLevel = 'error' | 'warn';

interface BrowserConsoleCapture {
  stop: () => Promise<string[]>;
}

interface ConsoleCaptureState {
  level: ConsoleLevel;
  messages: string[];
  original: (...data: unknown[]) => void;
}

type CaptureWindow = Window & {
  __qalemExpectedConsole?: ConsoleCaptureState;
};

/** Consume one explicitly expected browser-console family and expose its exact calls to the test. */
export async function captureExpectedBrowserConsole(
  page: Page,
  level: ConsoleLevel,
  expectedSubstring: string,
): Promise<BrowserConsoleCapture> {
  await page.evaluate(
    ({ expectedLevel, substring }) => {
      const captureWindow = window as CaptureWindow;
      const target = console as unknown as Record<ConsoleLevel, (...data: unknown[]) => void>;
      const original = target[expectedLevel].bind(console);
      const messages: string[] = [];

      target[expectedLevel] = (...data: unknown[]) => {
        const message = data
          .map((value) =>
            value instanceof Error ? `${value.name}: ${value.message}` : String(value),
          )
          .join(' ');
        if (message.includes(substring)) {
          messages.push(message);
          return;
        }
        original(...data);
      };
      captureWindow.__qalemExpectedConsole = { level: expectedLevel, messages, original };
    },
    { expectedLevel: level, substring: expectedSubstring },
  );

  return {
    stop: () =>
      page.evaluate(() => {
        const captureWindow = window as CaptureWindow;
        const state = captureWindow.__qalemExpectedConsole;
        if (!state) return [];
        const target = console as unknown as Record<ConsoleLevel, (...data: unknown[]) => void>;
        target[state.level] = state.original;
        delete captureWindow.__qalemExpectedConsole;
        return state.messages;
      }),
  };
}
