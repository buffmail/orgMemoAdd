import { NextResponse, type NextRequest } from 'next/server';

import {
  DROPBOX_APP_SECRET,
  DROPBOX_FILE_PATH,
  DROPBOX_REFRESH_TOKEN,
  APP_PASSCODE,
  callbackUrl,
} from '@/lib/config';
import { accessTokenFrom, currentAccount } from '@/lib/dropbox';
import { isLocked, refreshTokenOf } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const refreshToken = refreshTokenOf(request);
  const locked = isLocked(request);

  const status = {
    secretConfigured: Boolean(DROPBOX_APP_SECRET),
    passcodeRequired: Boolean(APP_PASSCODE),
    locked,
    connected: Boolean(refreshToken),
    // A server-side refresh token lets any visitor write, so the passcode is
    // not optional in that setup.
    openToAnyone: Boolean(DROPBOX_REFRESH_TOKEN) && !APP_PASSCODE,
    callbackUrl: callbackUrl(request.url),
    path: DROPBOX_FILE_PATH,
    account: null as { name: string; email: string } | null,
    accountError: null as string | null,
  };

  if (refreshToken && !locked && status.secretConfigured) {
    try {
      // Refreshing is the real liveness check for the link.
      const accessToken = await accessTokenFrom(refreshToken);

      try {
        status.account = await currentAccount(accessToken);
      } catch {
        // account_info.read is optional - it only names the linked account.
      }
    } catch (error) {
      status.connected = false;
      status.accountError = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  return NextResponse.json(status);
}
