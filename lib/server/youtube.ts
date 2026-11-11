import { randomBytes } from 'node:crypto';
import { openSecret, sealSecret, signValue, verifySignedValue } from '@/lib/server/secret-box';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

/**
 * Publication sur YouTube avec le compte Google DE LA PERSONNE : OAuth 2.0 par utilisateur
 * (accès hors ligne), envoi résumable de l'API Data v3. Aucun jeton ne quitte le serveur.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true';
const UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

/** `upload` publie ; `readonly` lit la chaîne pour afficher laquelle est connectée. */
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
] as const;

/** Un multiple de 256 Kio, comme l'exige l'envoi résumable. */
const CHUNK_BYTES = 8 * 1024 * 1024;
const CHUNK_ATTEMPTS = 4;
const STATE_DOMAIN = 'youtube-oauth-state';
const STATE_TTL_MS = 10 * 60 * 1000;
/** Catégorie « Éducation » de YouTube. */
const EDUCATION_CATEGORY_ID = '27';

export type YoutubePrivacy = 'unlisted' | 'private' | 'public';

export class YoutubeError extends Error {
  constructor(
    readonly code:
      | 'NOT_CONFIGURED'
      | 'RECONNECT_REQUIRED'
      | 'OAUTH_FAILED'
      | 'UPLOAD_FAILED'
      | 'QUOTA_EXCEEDED',
    message: string,
  ) {
    super(message);
    this.name = 'YoutubeError';
  }
}

export function youtubeOAuthConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function requireConfig(): { clientId: string; clientSecret: string } {
  const config = youtubeOAuthConfig();
  if (!config) throw new YoutubeError('NOT_CONFIGURED', 'YouTube OAuth client is not configured');
  return config;
}

export function youtubeRedirectUri(origin: string): string {
  return `${origin}/api/youtube/callback`;
}

/** État OAuth lié à la personne connectée et signé : le retour de Google ne peut pas être forgé. */
export function createOAuthState(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now + STATE_TTL_MS}.${randomBytes(8).toString('hex')}`;
  return `${payload}.${signValue(STATE_DOMAIN, payload)}`;
}

export function readOAuthState(state: string, userId: string, now = Date.now()): boolean {
  const cut = state.lastIndexOf('.');
  if (cut < 0) return false;
  const payload = state.slice(0, cut);
  if (!verifySignedValue(STATE_DOMAIN, payload, state.slice(cut + 1))) return false;
  const [stateUser, expires] = payload.split('.');
  return stateUser === userId && Number(expires) > now;
}

export function buildAuthorizationUrl(origin: string, state: string): string {
  const { clientId } = requireConfig();
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', youtubeRedirectUri(origin));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', YOUTUBE_SCOPES.join(' '));
  // Hors ligne et consentement forcé : seul ce couple garantit un jeton de rafraîchissement.
  url.searchParams.set('access_type', 'offline');
  // `select_account` : une chaîne rattachée à un compte de marque n'est visible que si la personne
  // choisit cette identité à l'écran Google ; sans lui, Google reprend l'identité déjà connectée.
  url.searchParams.set('prompt', 'select_account consent');
  url.searchParams.set('state', state);
  return url.toString();
}

type TokenResponse = { accessToken: string; refreshToken: string | null; scope: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(json) || typeof json.access_token !== 'string') {
    const reason = isRecord(json) && typeof json.error === 'string' ? json.error : response.status;
    // invalid_grant : jeton révoqué ou expiré, la personne doit reconnecter sa chaîne.
    throw new YoutubeError(
      reason === 'invalid_grant' ? 'RECONNECT_REQUIRED' : 'OAUTH_FAILED',
      `Google token endpoint refused the request (${reason})`,
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : null,
    scope: typeof json.scope === 'string' ? json.scope : '',
  };
}

export function exchangeAuthorizationCode(code: string, origin: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = requireConfig();
  return postToken(
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: youtubeRedirectUri(origin),
      grant_type: 'authorization_code',
    }),
  );
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = requireConfig();
  const token = await postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  );
  return token.accessToken;
}

export async function fetchOwnChannel(
  accessToken: string,
): Promise<{ id: string; title: string } | null> {
  const response = await fetch(CHANNELS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // Une API désactivée ou un jeton refusé n'est pas « pas de chaîne » : on le dit, avec la raison de Google.
    const reason =
      isRecord(json) && isRecord(json.error) && typeof json.error.status === 'string'
        ? json.error.status
        : String(response.status);
    throw new YoutubeError(
      'OAUTH_FAILED',
      `YouTube channel lookup refused (${response.status} ${reason})`,
    );
  }
  if (!isRecord(json) || !Array.isArray(json.items)) return null;
  const item: unknown = json.items[0];
  if (!isRecord(item) || typeof item.id !== 'string' || !isRecord(item.snippet)) return null;
  const title = item.snippet.title;
  return { id: item.id, title: typeof title === 'string' && title.trim() ? title : item.id };
}

// ---------------------------------------------------------------------------
// Connexion de la personne
// ---------------------------------------------------------------------------

export async function saveYoutubeConnection(input: {
  userId: string;
  channelId: string;
  channelTitle: string;
  scope: string;
  refreshToken: string;
}): Promise<void> {
  const sealed = sealSecret(input.refreshToken);
  const { error } = await createServiceSupabaseClient().from('youtube_connections').upsert({
    user_id: input.userId,
    channel_id: input.channelId,
    channel_title: input.channelTitle,
    scope: input.scope,
    refresh_ciphertext: sealed.ciphertext,
    refresh_iv: sealed.iv,
    refresh_tag: sealed.tag,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`YouTube connection save failed: ${error.message}`);
}

export async function readYoutubeChannel(
  userId: string,
): Promise<{ channelId: string; channelTitle: string } | null> {
  const { data, error } = await createServiceSupabaseClient()
    .from('youtube_connections')
    .select('channel_id, channel_title')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`YouTube connection lookup failed: ${error.message}`);
  return data ? { channelId: data.channel_id, channelTitle: data.channel_title } : null;
}

async function readRefreshToken(userId: string): Promise<string | null> {
  const { data, error } = await createServiceSupabaseClient()
    .from('youtube_connections')
    .select('refresh_ciphertext, refresh_iv, refresh_tag')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`YouTube connection lookup failed: ${error.message}`);
  if (!data) return null;
  return openSecret({
    ciphertext: data.refresh_ciphertext,
    iv: data.refresh_iv,
    tag: data.refresh_tag,
  });
}

/** Déconnexion : révocation chez Google (au mieux) puis effacement du jeton. */
export async function deleteYoutubeConnection(userId: string): Promise<void> {
  const refreshToken = await readRefreshToken(userId).catch(() => null);
  if (refreshToken) {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
  }
  const { error } = await createServiceSupabaseClient()
    .from('youtube_connections')
    .delete()
    .eq('user_id', userId);
  if (error) throw new Error(`YouTube connection delete failed: ${error.message}`);
}

/** Jeton d'accès frais ; un jeton révoqué efface la connexion et demande de la refaire. */
export async function freshAccessToken(userId: string): Promise<string> {
  const refreshToken = await readRefreshToken(userId);
  if (!refreshToken) throw new YoutubeError('RECONNECT_REQUIRED', 'No YouTube channel connected');
  try {
    return await refreshAccessToken(refreshToken);
  } catch (error) {
    if (error instanceof YoutubeError && error.code === 'RECONNECT_REQUIRED') {
      await deleteYoutubeConnection(userId);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Envoi résumable
// ---------------------------------------------------------------------------

export type UploadedVideo = { videoId: string; appliedPrivacy: string | null };

function readUploadedVideo(json: unknown): UploadedVideo | null {
  if (!isRecord(json) || typeof json.id !== 'string') return null;
  const status = json.status;
  return {
    videoId: json.id,
    appliedPrivacy:
      isRecord(status) && typeof status.privacyStatus === 'string' ? status.privacyStatus : null,
  };
}

async function failureOf(response: Response): Promise<YoutubeError> {
  const text = await response.text().catch(() => '');
  if (response.status === 403 && text.includes('quotaExceeded')) {
    return new YoutubeError('QUOTA_EXCEEDED', 'YouTube daily upload quota exceeded');
  }
  if (response.status === 401) {
    return new YoutubeError('RECONNECT_REQUIRED', 'YouTube refused the access token');
  }
  return new YoutubeError('UPLOAD_FAILED', `YouTube upload failed (${response.status})`);
}

/** Octets déjà reçus par YouTube, d'après l'en-tête Range d'une réponse 308 (« bytes=0-N »). */
function receivedBytes(response: Response): number {
  const match = /bytes=0-(\d+)/.exec(response.headers.get('Range') ?? '');
  return match ? Number(match[1]) + 1 : 0;
}

export async function uploadVideoResumable(input: {
  accessToken: string;
  file: Buffer;
  title: string;
  description: string;
  privacyStatus: YoutubePrivacy;
}): Promise<UploadedVideo> {
  const total = input.file.length;
  const init = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(total),
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify({
      snippet: {
        title: input.title,
        description: input.description,
        categoryId: EDUCATION_CATEGORY_ID,
      },
      status: { privacyStatus: input.privacyStatus, selfDeclaredMadeForKids: false },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const sessionUrl = init.headers.get('Location');
  if (!init.ok || !sessionUrl) throw await failureOf(init);

  let offset = 0;
  let failures = 0;
  while (offset < total) {
    const end = Math.min(offset + CHUNK_BYTES, total);
    let response: Response;
    try {
      response = await fetch(sessionUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': String(end - offset),
          'Content-Range': `bytes ${offset}-${end - 1}/${total}`,
        },
        body: new Uint8Array(input.file.subarray(offset, end)),
        signal: AbortSignal.timeout(5 * 60 * 1000),
      });
    } catch {
      response = new Response(null, { status: 503 });
    }
    if (response.status === 200 || response.status === 201) {
      const video = readUploadedVideo(await response.json().catch(() => null));
      if (!video) throw new YoutubeError('UPLOAD_FAILED', 'YouTube answered without a video id');
      return video;
    }
    if (response.status === 308) {
      offset = receivedBytes(response);
      failures = 0;
      continue;
    }
    if (response.status >= 500 && failures < CHUNK_ATTEMPTS) {
      failures += 1;
      // Reprise : on demande à YouTube où il en est avant de renvoyer quoi que ce soit.
      await new Promise((resolve) => setTimeout(resolve, 2000 * failures));
      const probe = await fetch(sessionUrl, {
        method: 'PUT',
        headers: { 'Content-Length': '0', 'Content-Range': `bytes */${total}` },
        signal: AbortSignal.timeout(30_000),
      }).catch(() => null);
      if (probe?.status === 308) offset = receivedBytes(probe);
      continue;
    }
    throw await failureOf(response);
  }
  throw new YoutubeError('UPLOAD_FAILED', 'YouTube upload ended without a confirmation');
}
