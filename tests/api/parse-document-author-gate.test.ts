import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse, type NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ requireAuthor: vi.fn() }));

vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrAnyOrgAuthor: mocks.requireAuthor }));

function upload(): NextRequest {
  const form = new FormData();
  form.set('document', new File(['Bonjour'], 'note.txt', { type: 'text/plain' }));
  return new Request('http://localhost/api/parse-document', {
    method: 'POST',
    body: form,
  }) as unknown as NextRequest;
}

// Cold module graphs are slow on a loaded machine; import once, outside the test timeouts.
beforeAll(async () => {
  await import('@/app/api/parse-document/route');
}, 120_000);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/parse-document authorization', () => {
  it('refuses a signed-in account without an author role before reading the file', async () => {
    mocks.requireAuthor.mockResolvedValue({
      response: NextResponse.json({ error: 'Author access required' }, { status: 403 }),
    });
    const { POST } = await import('@/app/api/parse-document/route');
    const response = await POST(upload());
    expect(response.status).toBe(403);
  });

  it('extracts the text for an author', async () => {
    mocks.requireAuthor.mockResolvedValue({ user: { id: 'u1', email: 'a@example.com' } });
    const { POST } = await import('@/app/api/parse-document/route');
    const response = await POST(upload());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { text: string } };
    expect(body.data.text).toBe('Bonjour');
  });
});
