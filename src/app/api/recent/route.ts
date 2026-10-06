import { NextResponse, type NextRequest } from 'next/server';

import { DROPBOX_APP_SECRET, DROPBOX_FILE_PATH } from '@/lib/config';
import { accessTokenFrom, DropboxError, readFileText } from '@/lib/dropbox';
import { recentEntries } from '@/lib/org';
import { isLocked, refreshTokenOf } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const refreshToken = refreshTokenOf(request);

  if (!DROPBOX_APP_SECRET || isLocked(request) || !refreshToken) {
    return NextResponse.json({ entries: [] }, { status: 401 });
  }

  try {
    const content = await readFileText(
      await accessTokenFrom(refreshToken),
      DROPBOX_FILE_PATH,
    );

    return NextResponse.json({ entries: content === null ? [] : recentEntries(content) });
  } catch (error) {
    return NextResponse.json(
      {
        entries: [],
        error: error instanceof DropboxError ? error.message : 'Could not read the file.',
      },
      { status: 502 },
    );
  }
}
