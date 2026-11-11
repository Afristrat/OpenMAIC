import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSecret, sealSecret } from '@/lib/server/secret-box';
import {
  buildAuthorizationUrl,
  createOAuthState,
  fetchOwnChannel,
  readOAuthState,
  uploadVideoResumable,
  YoutubeError,
} from '@/lib/server/youtube';
import { extractChapterVideo } from '@/lib/server/youtube-upload';
import { parsePublishInput } from '@/lib/server/youtube-publish-input';

const USER = '11111111-1111-4111-8111-111111111111';
const JOB = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  process.env.LRS_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  process.env.YOUTUBE_OAUTH_CLIENT_ID = 'client-id.apps.googleusercontent.com';
  process.env.YOUTUBE_OAUTH_CLIENT_SECRET = 'client-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('secret-box', () => {
  it('rend le secret d’origine et ne laisse rien de lisible dans le chiffré', () => {
    const sealed = sealSecret('1//refresh-token-secret');
    expect(sealed.ciphertext.startsWith('\\x')).toBe(true);
    expect(Buffer.from(sealed.ciphertext.slice(2), 'hex').toString('utf8')).not.toContain(
      'refresh-token',
    );
    expect(openSecret(sealed)).toBe('1//refresh-token-secret');
  });

  it('refuse un chiffré altéré', () => {
    const sealed = sealSecret('secret');
    const flipped = `${sealed.ciphertext.slice(0, 2)}${sealed.ciphertext.slice(2, 4) === '00' ? '11' : '00'}${sealed.ciphertext.slice(4)}`;
    expect(() => openSecret({ ...sealed, ciphertext: flipped })).toThrow();
  });
});

describe('état OAuth', () => {
  it('est valide pour la personne qui l’a demandé, une seule fois dans la fenêtre', () => {
    const state = createOAuthState(USER, 1_000);
    expect(readOAuthState(state, USER, 1_000 + 60_000)).toBe(true);
  });

  it('est refusé pour une autre personne, expiré ou falsifié', () => {
    const state = createOAuthState(USER, 1_000);
    expect(readOAuthState(state, '33333333-3333-4333-8333-333333333333', 2_000)).toBe(false);
    expect(readOAuthState(state, USER, 1_000 + 11 * 60_000)).toBe(false);
    expect(readOAuthState(`${state}x`, USER, 2_000)).toBe(false);
    expect(readOAuthState('sans-point', USER, 2_000)).toBe(false);
  });

  it('demande l’accès hors ligne, le consentement et les deux droits', () => {
    const url = new URL(buildAuthorizationUrl('https://qalem.ma', 'etat'));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('select_account consent');
    expect(url.searchParams.get('redirect_uri')).toBe('https://qalem.ma/api/youtube/callback');
    expect(url.searchParams.get('scope')).toContain('youtube.upload');
    expect(url.searchParams.get('scope')).toContain('youtube.readonly');
  });

  it('refuse de démarrer sans client OAuth configuré', () => {
    delete process.env.YOUTUBE_OAUTH_CLIENT_ID;
    expect(() => buildAuthorizationUrl('https://qalem.ma', 'etat')).toThrow(YoutubeError);
  });
});

describe('envoi résumable', () => {
  const session = 'https://upload.example/session';
  const video = Buffer.alloc(10 * 1024 * 1024, 1); // 10 Mio : deux morceaux de 8 Mio et 2 Mio

  function stubFetch(responses: Response[]): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn();
    for (const response of responses) fetchMock.mockResolvedValueOnce(response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }
  const initOk = (): Response =>
    new Response(null, { status: 200, headers: { Location: session } });
  const doneBody = JSON.stringify({ id: 'abc123', status: { privacyStatus: 'unlisted' } });

  it('envoie en morceaux, déclare non répertoriée et non destinée aux enfants, rend l’identifiant', async () => {
    const fetchMock = stubFetch([
      initOk(),
      new Response(null, { status: 308, headers: { Range: `bytes=0-${8 * 1024 * 1024 - 1}` } }),
      new Response(doneBody, { status: 200 }),
    ]);
    const result = await uploadVideoResumable({
      accessToken: 'jeton',
      file: video,
      title: 'Titre',
      description: 'Desc',
      privacyStatus: 'unlisted',
    });
    expect(result).toEqual({ videoId: 'abc123', appliedPrivacy: 'unlisted' });

    const [, init] = fetchMock.mock.calls[0];
    const sent = JSON.parse(String(init.body));
    expect(sent.status).toEqual({ privacyStatus: 'unlisted', selfDeclaredMadeForKids: false });
    expect(sent.snippet.title).toBe('Titre');
    expect(init.headers.Authorization).toBe('Bearer jeton');
    expect(fetchMock.mock.calls[1][1].headers['Content-Range']).toBe(
      `bytes 0-${8 * 1024 * 1024 - 1}/${video.length}`,
    );
    expect(fetchMock.mock.calls[2][1].headers['Content-Range']).toBe(
      `bytes ${8 * 1024 * 1024}-${video.length - 1}/${video.length}`,
    );
    // fetch (undici) refuse un Content-Length posé à la main : aucun envoi ne doit en porter.
    for (const [, init] of fetchMock.mock.calls.slice(1)) {
      expect(Object.keys(init.headers)).not.toContain('Content-Length');
    }
  });

  it('rapporte la confidentialité réellement appliquée par YouTube', async () => {
    stubFetch([
      initOk(),
      new Response(JSON.stringify({ id: 'v', status: { privacyStatus: 'private' } }), {
        status: 200,
      }),
    ]);
    const result = await uploadVideoResumable({
      accessToken: 'jeton',
      file: Buffer.alloc(1024),
      title: 'T',
      description: '',
      privacyStatus: 'unlisted',
    });
    expect(result.appliedPrivacy).toBe('private');
  });

  it('reprend après une erreur 503 en demandant où YouTube en est', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch([
      initOk(),
      new Response(null, { status: 503 }),
      new Response(null, { status: 308 }), // sondage : rien reçu
      new Response(doneBody, { status: 200 }),
    ]);
    const pending = uploadVideoResumable({
      accessToken: 'jeton',
      file: Buffer.alloc(2048),
      title: 'T',
      description: '',
      privacyStatus: 'unlisted',
    });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ videoId: 'abc123' });
    expect(fetchMock.mock.calls[2][1].headers['Content-Range']).toBe('bytes */2048');
  });

  it('rend la vraie cause d’une coupure réseau persistante au lieu d’un faux 503', async () => {
    vi.useFakeTimers();
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(initOk());
    for (let i = 0; i < 5; i += 1) {
      fetchMock.mockRejectedValueOnce(timeout); // envoi du morceau
      if (i < 4) fetchMock.mockResolvedValueOnce(new Response(null, { status: 308 })); // sondage
    }
    vi.stubGlobal('fetch', fetchMock);
    const pending = uploadVideoResumable({
      accessToken: 'j',
      file: Buffer.alloc(2048),
      title: 'T',
      description: '',
      privacyStatus: 'unlisted',
    });
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'UPLOAD_FAILED',
      message: expect.stringContaining('network failure (TimeoutError'),
    });
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('rapporte la cause enveloppée par fetch (code et message)', async () => {
    vi.useFakeTimers();
    const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    const failed = new TypeError('fetch failed', { cause: reset });
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(initOk());
    for (let i = 0; i < 5; i += 1) {
      fetchMock.mockRejectedValueOnce(failed);
      if (i < 4) fetchMock.mockResolvedValueOnce(new Response(null, { status: 308 }));
    }
    vi.stubGlobal('fetch', fetchMock);
    const pending = uploadVideoResumable({
      accessToken: 'j',
      file: Buffer.alloc(2048),
      title: 'T',
      description: '',
      privacyStatus: 'unlisted',
    });
    const assertion = expect(pending).rejects.toMatchObject({
      message: expect.stringContaining(
        'TypeError: fetch failed <- ECONNRESET Error: read ECONNRESET',
      ),
    });
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('rend le motif de Google et la position quand les 503 persistent', async () => {
    vi.useFakeTimers();
    const busy = (): Response =>
      new Response('{"error":{"errors":[{"reason":"backendError"}]}}', { status: 503 });
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(initOk());
    for (let i = 0; i < 5; i += 1) {
      fetchMock.mockResolvedValueOnce(busy());
      if (i < 4) fetchMock.mockResolvedValueOnce(new Response(null, { status: 308 }));
    }
    vi.stubGlobal('fetch', fetchMock);
    const pending = uploadVideoResumable({
      accessToken: 'j',
      file: Buffer.alloc(2048),
      title: 'T',
      description: '',
      privacyStatus: 'unlisted',
    });
    const assertion = expect(pending).rejects.toMatchObject({
      message: 'YouTube upload failed (503 backendError) at byte 0/2048 after 5 attempt(s)',
    });
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('termine quand le sondage révèle que YouTube a déjà tout reçu', async () => {
    vi.useFakeTimers();
    stubFetch([
      initOk(),
      new Response(null, { status: 503 }),
      new Response(doneBody, { status: 201 }), // sondage : envoi déjà complet
    ]);
    const pending = uploadVideoResumable({
      accessToken: 'j',
      file: Buffer.alloc(2048),
      title: 'T',
      description: '',
      privacyStatus: 'unlisted',
    });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ videoId: 'abc123' });
  });

  it('distingue le quota quotidien épuisé et la connexion expirée', async () => {
    stubFetch([new Response('{"error":{"errors":[{"reason":"quotaExceeded"}]}}', { status: 403 })]);
    await expect(
      uploadVideoResumable({
        accessToken: 'j',
        file: Buffer.alloc(8),
        title: 'T',
        description: '',
        privacyStatus: 'unlisted',
      }),
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });

    stubFetch([new Response('', { status: 401 })]);
    await expect(
      uploadVideoResumable({
        accessToken: 'j',
        file: Buffer.alloc(8),
        title: 'T',
        description: '',
        privacyStatus: 'unlisted',
      }),
    ).rejects.toMatchObject({ code: 'RECONNECT_REQUIRED' });
  });
});

describe('extraction d’un chapitre', () => {
  it('rend le MP4 du rang demandé, dans l’ordre numéroté de l’archive', async () => {
    const archive = new JSZip();
    archive.file('02 - Deuxième.mp4', 'deux');
    archive.file('01 - Première.mp4', 'un');
    archive.file('03 - Troisième.mp4', 'trois');
    const zip = await archive.generateAsync({ type: 'nodebuffer' });
    expect((await extractChapterVideo(zip, 0)).toString()).toBe('un');
    expect((await extractChapterVideo(zip, 2)).toString()).toBe('trois');
    await expect(extractChapterVideo(zip, 3)).rejects.toThrow('not found');
  });
});

describe('demande de publication', () => {
  it('accepte une vidéo entière ou un chapitre, et nettoie les espaces', () => {
    expect(parsePublishInput({ exportJobId: JOB, title: '  Titre  ' })).toEqual({
      ok: true,
      value: { exportJobId: JOB, chapterIndex: null, title: 'Titre', description: '' },
    });
    expect(parsePublishInput({ exportJobId: JOB, chapterIndex: 2, title: 'T' })).toMatchObject({
      ok: true,
      value: { chapterIndex: 2 },
    });
  });

  it.each([
    [{ exportJobId: 'pas-un-uuid', title: 'T' }],
    [{ exportJobId: JOB, title: '   ' }],
    [{ exportJobId: JOB, title: 'x'.repeat(101) }],
    [{ exportJobId: JOB, title: 'a<b' }],
    [{ exportJobId: JOB, title: 'T', description: 'x>y' }],
    [{ exportJobId: JOB, title: 'T', description: 'x'.repeat(5001) }],
    [{ exportJobId: JOB, title: 'T', chapterIndex: -1 }],
    [{ exportJobId: JOB, title: 'T', chapterIndex: 1.5 }],
    [null],
  ])('refuse %j', (body) => {
    expect(parsePublishInput(body).ok).toBe(false);
  });
});

describe('lecture de la chaîne connectée', () => {
  const answer = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status });

  it('rend la chaîne trouvée', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          answer(200, { items: [{ id: 'UC1', snippet: { title: 'Ma chaîne' } }] }),
        ),
    );
    await expect(fetchOwnChannel('jeton')).resolves.toEqual({ id: 'UC1', title: 'Ma chaîne' });
  });

  it('rend null quand le compte n’a vraiment aucune chaîne', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(200, { items: [] })));
    await expect(fetchOwnChannel('jeton')).resolves.toBeNull();
  });

  it('signale l’échec de Google au lieu de le faire passer pour une absence de chaîne', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(answer(403, { error: { status: 'PERMISSION_DENIED' } })),
    );
    await expect(fetchOwnChannel('jeton')).rejects.toThrow(/403 PERMISSION_DENIED/);
  });
});
