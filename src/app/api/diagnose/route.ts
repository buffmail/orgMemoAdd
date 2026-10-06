import { NextResponse, type NextRequest } from 'next/server';

import { DROPBOX_FILE_PATH } from '@/lib/config';
import { accessTokenFrom, diagnose } from '@/lib/dropbox';
import { isLocked, refreshTokenOf } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const refreshToken = refreshTokenOf(request);

  if (isLocked(request) || !refreshToken) {
    return NextResponse.json({ error: 'Not linked.' }, { status: 401 });
  }

  try {
    return NextResponse.json(
      await diagnose(await accessTokenFrom(refreshToken), DROPBOX_FILE_PATH),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Diagnose failed.' },
      { status: 502 },
    );
  }
}
