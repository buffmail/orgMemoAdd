import { NextResponse, type NextRequest } from 'next/server';

import { DROPBOX_APP_SECRET, DROPBOX_FILE_PATH } from '@/lib/config';
import { accessTokenFrom, DropboxError, readFileText } from '@/lib/dropbox';
import { tailSection } from '@/lib/org';
import { isLocked, refreshTokenOf } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const refreshToken = refreshTokenOf(request);

  if (!DROPBOX_APP_SECRET || isLocked(request) || !refreshToken) {
    return NextResponse.json({ title: null, entries: [], body: [] }, { status: 401 });
  }

  try {
    const content = await readFileText(
      await accessTokenFrom(refreshToken),
      DROPBOX_FILE_PATH,
    );

    return NextResponse.json(
      content === null ? { title: null, entries: [], body: [] } : tailSection(content),
    );
  } catch (error) {
    return NextResponse.json(
      {
        title: null,
        entries: [],
        body: [],
        error: error instanceof DropboxError ? error.message : 'Could not read the file.',
      },
      { status: 502 },
    );
  }
}
