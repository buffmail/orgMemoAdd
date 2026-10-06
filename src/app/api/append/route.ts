import { NextResponse, type NextRequest } from 'next/server';

import { DROPBOX_APP_SECRET, DROPBOX_FILE_PATH } from '@/lib/config';
import { accessTokenFrom, appendToFile, DropboxError } from '@/lib/dropbox';
import { formatEntry } from '@/lib/org';
import { isLocked, refreshTokenOf } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MEMO_LENGTH = 100_000;

export async function POST(request: NextRequest) {
  if (!DROPBOX_APP_SECRET) {
    return NextResponse.json(
      { error: 'DROPBOX_APP_SECRET is not set. See the README for setup.' },
      { status: 500 },
    );
  }

  if (isLocked(request)) {
    return NextResponse.json({ error: 'Locked.', locked: true }, { status: 401 });
  }

  const refreshToken = refreshTokenOf(request);
  if (!refreshToken) {
    return NextResponse.json(
      { error: 'Dropbox is not linked yet.', needsAuth: true },
      { status: 401 },
    );
  }

  const { memo } = (await request.json().catch(() => ({}))) as { memo?: string };
  if (!memo || !memo.trim()) {
    return NextResponse.json({ error: 'The memo is empty.' }, { status: 400 });
  }
  if (memo.length > MAX_MEMO_LENGTH) {
    return NextResponse.json({ error: 'The memo is too long.' }, { status: 413 });
  }

  try {
    const result = await appendToFile(
      await accessTokenFrom(refreshToken),
      DROPBOX_FILE_PATH,
      formatEntry(memo),
    );

    return NextResponse.json({
      ok: true,
      path: result.path_display || DROPBOX_FILE_PATH,
      size: result.size,
    });
  } catch (error) {
    if (error instanceof DropboxError) {
      const needsAuth = error.status === 401 || error.message.includes('invalid_grant');
      return NextResponse.json(
        { error: describe(error), needsAuth },
        { status: error.status === 401 ? 401 : 502 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Append failed.' },
      { status: 500 },
    );
  }
}

function describe(error: DropboxError): string {
  if (error.message.includes('insufficient_scope')) {
    return 'The Dropbox app is missing files.content.read / files.content.write. Add the scopes, then link again.';
  }
  if (error.message.includes('not_found')) {
    return `Dropbox cannot see ${DROPBOX_FILE_PATH}. For an App-folder app the path is relative to the app folder.`;
  }
  if (error.message.includes('invalid_grant')) {
    return 'The Dropbox link expired. Link the account again.';
  }

  return `Dropbox rejected the write: ${error.message}`;
}
