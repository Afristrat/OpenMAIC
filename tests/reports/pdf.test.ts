import { describe, expect, it } from 'vitest';
import { createInstitutionalReportPdf } from '@/lib/reports/pdf';

describe('institutional report PDF', () => {
  it('creates a complete PDF with the built-in font assets', async () => {
    const pdf = await createInstitutionalReportPdf({
      organizationName: 'Qalem Démonstration',
      dateFrom: '2026-07-01T00:00:00.000Z',
      dateTo: '2026-07-20T00:00:00.000Z',
      metrics: {
        totalLearners: 12,
        activeClassrooms: 3,
        avgScore: 84.5,
        completionRate: 72.25,
      },
      formations: [],
    });

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1_000);
  });
});
