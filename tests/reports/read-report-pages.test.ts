import { expect, it } from 'vitest';
import { readReportPages } from '@/lib/reports/read-report-pages';

it('continues through a server cap smaller than the requested page', async () => {
  const rows = Array.from({ length: 205 }, (_, id) => id);
  const received: number[] = [];
  for await (const row of readReportPages(async (from) => ({
    data: rows.slice(from, from + 7),
    count: rows.length,
    error: null,
  })))
    received.push(row);
  expect(received).toEqual(rows);
});

it.each(['missing-count', 'missing-data', 'empty-page', 'error', 'changed-count'])(
  'rejects %s instead of certifying an incomplete report',
  async (kind) => {
    const collect = async () => {
      for await (const row of readReportPages(async (from) => ({
        data: kind === 'missing-data' ? null : kind === 'empty-page' ? [] : [from],
        count: kind === 'missing-count' ? null : kind === 'changed-count' && from ? 3 : 2,
        error: kind === 'error' ? new Error('Unavailable') : null,
      }))) {
        void row;
      }
    };
    await expect(collect()).rejects.toThrow();
  },
);
