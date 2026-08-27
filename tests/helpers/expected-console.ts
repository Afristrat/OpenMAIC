import { expect, onTestFinished, vi } from 'vitest';

type ConsoleExpectations = {
  readonly error?: readonly (string | RegExp)[];
  readonly warn?: readonly (string | RegExp)[];
};

function firstLine(value: unknown): string {
  return String(value)
    .split('\n', 1)[0]
    .replace(/^\[[^\]]+\] /, '')
    .replaceAll(process.cwd(), '<cwd>');
}

function assertMessages(actual: string[], expected: readonly (string | RegExp)[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((message, index) => {
    if (typeof message === 'string') expect(actual[index]).toBe(message);
    else expect(actual[index]).toMatch(message);
  });
}

/**
 * Consume an intentional console contract inside one negative-path test.
 * Every message is compared exactly after removing only its dynamic timestamp
 * and stack lines; the spy is restored even when the test body fails.
 */
export function expectConsoleMessages(expectations: ConsoleExpectations): void {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  onTestFinished(() => {
    try {
      assertMessages(
        warn.mock.calls.map(([message]) => firstLine(message)),
        expectations.warn ?? [],
      );
      assertMessages(
        error.mock.calls.map(([message]) => firstLine(message)),
        expectations.error ?? [],
      );
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });
}
