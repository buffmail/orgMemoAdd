import { DROPBOX_APP_KEY, DROPBOX_APP_SECRET } from './config';
import { appendEntry } from './org';

const AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const RPC_URL = 'https://api.dropboxapi.com/2';
const CONTENT_URL = 'https://content.dropboxapi.com/2';

const MAX_APPEND_ATTEMPTS = 3;

export class DropboxError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DropboxError';
    this.status = status;
  }
}

/** Dropbox-API-Arg must be ASCII, so non-ASCII characters (e.g. /앱/) are escaped. */
function apiArg(value: unknown): string {
  return JSON.stringify(value).replace(
    /[^\x20-\x7e]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/**
 * No `scope` parameter: a legacy (pre-scoped) Dropbox app rejects it outright
 * ("scope must be at most 0 characters"), and a scoped app without it simply
 * grants everything on its Permissions tab. Omitting it is correct for both.
 */
export function authorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    response_type: 'code',
    redirect_uri: redirectUri,
    token_access_type: 'offline',
    state,
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function requestToken(params: Record<string, string>) {
  if (!DROPBOX_APP_SECRET) {
    throw new DropboxError('DROPBOX_APP_SECRET is not configured.', 500);
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: DROPBOX_APP_KEY,
      client_secret: DROPBOX_APP_SECRET,
      ...params,
    }),
    cache: 'no-store',
  });

  const body = await response.text();
  if (!response.ok) {
    throw new DropboxError(`Dropbox token request failed: ${body}`, response.status);
  }

  return JSON.parse(body) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    account_id?: string;
  };
}

export async function exchangeCode(code: string, redirectUri: string) {
  const token = await requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  if (!token.refresh_token) {
    throw new DropboxError(
      'Dropbox did not return a refresh token. The authorize request must use token_access_type=offline.',
      502,
    );
  }

  return { accessToken: token.access_token, refreshToken: token.refresh_token };
}

export async function accessTokenFrom(refreshToken: string): Promise<string> {
  const token = await requestToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  return token.access_token;
}

export async function currentAccount(accessToken: string) {
  const response = await fetch(`${RPC_URL}/users/get_current_account`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new DropboxError(await response.text(), response.status);
  }

  const account = (await response.json()) as {
    email?: string;
    name?: { display_name?: string };
  };

  return { email: account.email ?? '', name: account.name?.display_name ?? '' };
}

type StoredFile = { content: string; rev: string } | null;

async function downloadFile(accessToken: string, path: string): Promise<StoredFile> {
  const response = await fetch(`${CONTENT_URL}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': apiArg({ path }),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    // The file not existing yet is not an error - the first memo creates it.
    if (response.status === 409 && body.includes('not_found')) return null;
    throw new DropboxError(body, response.status);
  }

  const metadata = JSON.parse(response.headers.get('dropbox-api-result') || '{}') as {
    rev?: string;
  };

  return { content: await response.text(), rev: metadata.rev ?? '' };
}

async function uploadFile(
  accessToken: string,
  path: string,
  content: string,
  rev: string | null,
) {
  const mode = rev ? { '.tag': 'update', update: rev } : { '.tag': 'add' };

  const response = await fetch(`${CONTENT_URL}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': apiArg({
        path,
        mode,
        autorename: false,
        mute: true,
        strict_conflict: true,
      }),
    },
    body: new TextEncoder().encode(content),
    cache: 'no-store',
  });

  const body = await response.text();
  if (!response.ok) {
    throw new DropboxError(body, response.status);
  }

  return JSON.parse(body) as { rev: string; size: number; path_display: string };
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof DropboxError &&
    error.status === 409 &&
    error.message.includes('conflict')
  );
}

/**
 * Appends text to the end of a Dropbox file. Dropbox has no append primitive, so
 * this reads the file and writes it back with mode=update, which fails instead of
 * silently forking the file when something else wrote in between; on that conflict
 * we re-read and retry so a concurrent write is never lost.
 */
export async function appendToFile(accessToken: string, path: string, entry: string) {
  for (let attempt = 1; attempt <= MAX_APPEND_ATTEMPTS; attempt += 1) {
    const existing = await downloadFile(accessToken, path);

    try {
      return await uploadFile(
        accessToken,
        path,
        appendEntry(existing?.content ?? '', entry),
        existing?.rev || null,
      );
    } catch (error) {
      const retryable = isConflict(error) && attempt < MAX_APPEND_ATTEMPTS;
      if (!retryable) throw error;
    }
  }

  throw new DropboxError('Could not append: the file kept changing underneath.', 409);
}

async function rpc(accessToken: string, endpoint: string, body: unknown) {
  const response = await fetch(`${RPC_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const text = await response.text();
  return response.ok ? JSON.parse(text) : { failed: text };
}

/** Reports what the app can actually see, to tell a wrong path from a wrong root. */
export async function diagnose(accessToken: string, path: string) {
  const [root, target, search] = await Promise.all([
    rpc(accessToken, 'files/list_folder', { path: '', recursive: false }),
    rpc(accessToken, 'files/get_metadata', { path }),
    rpc(accessToken, 'files/search_v2', { query: 'life.org', options: { max_results: 20 } }),
  ]);

  return {
    configuredPath: path,
    rootEntries: (root.entries ?? []).map(
      (entry: { '.tag': string; path_display: string; size?: number }) =>
        `${entry['.tag']}  ${entry.path_display}${entry.size ? `  ${entry.size}B` : ''}`,
    ),
    rootError: root.failed ?? null,
    target: target.failed
      ? { exists: false, error: target.failed }
      : { exists: true, path: target.path_display, size: target.size, rev: target.rev },
    matches: (search.matches ?? []).map(
      (match: { metadata: { metadata: { path_display: string; size?: number } } }) =>
        `${match.metadata.metadata.path_display}  ${match.metadata.metadata.size ?? '?'}B`,
    ),
    searchError: search.failed ?? null,
  };
}

/** Current contents of the file, or null when it does not exist yet. */
export async function readFileText(accessToken: string, path: string) {
  return (await downloadFile(accessToken, path))?.content ?? null;
}
