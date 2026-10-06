import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

import { DROPBOX_APP_SECRET, callbackUrl } from '@/lib/config';
import { authorizeUrl } from '@/lib/dropbox';
import { setOauthState } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!DROPBOX_APP_SECRET) {
    return NextResponse.redirect(new URL('/?error=no-secret', request.url));
  }

  const state = randomUUID();
  const response = NextResponse.redirect(
    authorizeUrl(callbackUrl(request.url), state),
  );
  setOauthState(response, state);

  return response;
}
