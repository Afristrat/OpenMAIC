import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    storage: {
      from: () => ({ download: mocks.download }),
    },
  }),
}));

describe('five-character learning resource links', () => {
  beforeEach(() => {
    mocks.download.mockReset();
  });

  it('streams the persisted workbook from a case-sensitive short code', async () => {
    mocks.download
      .mockResolvedValueOnce({
        data: new Blob([
          JSON.stringify({
            classroomId: 'classroom_1',
            resourceId: 'resource_1',
            fileName: 'budget-tresorerie.xlsx',
          }),
        ]),
        error: null,
      })
      .mockResolvedValueOnce({ data: new Blob(['PK-workbook']), error: null });
    const { GET } = await import('@/app/[shortCode]/route');

    const response = await GET(new Request('https://qalem.ma/A7bK2'), {
      params: Promise.resolve({ shortCode: 'A7bK2' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers.get('content-disposition')).toContain('budget-tresorerie.xlsx');
    expect(mocks.download).toHaveBeenNthCalledWith(1, 'short-links/A7bK2.json');
    expect(mocks.download).toHaveBeenNthCalledWith(2, 'classroom_1/resources/resource_1.xlsx');
  });

  it('rejects any code that is not exactly five alphanumeric characters', async () => {
    const { GET } = await import('@/app/[shortCode]/route');

    const response = await GET(new Request('https://qalem.ma/abcdef'), {
      params: Promise.resolve({ shortCode: 'abcdef' }),
    });

    expect(response.status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('sert un document Word réel avec son type MIME', async () => {
    mocks.download
      .mockResolvedValueOnce({
        data: new Blob([
          JSON.stringify({
            classroomId: 'classroom_1',
            resourceId: 'resource_2',
            fileName: 'fiche-sipoc.docx',
          }),
        ]),
        error: null,
      })
      .mockResolvedValueOnce({ data: new Blob(['PK-document']), error: null });
    const { GET } = await import('@/app/[shortCode]/route');

    const response = await GET(new Request('https://qalem.ma/B8cL3'), {
      params: Promise.resolve({ shortCode: 'B8cL3' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(mocks.download).toHaveBeenNthCalledWith(2, 'classroom_1/resources/resource_2.docx');
  });
});
