import { NextResponse, type NextRequest } from 'next/server';

import { callbackUrl } from '@/lib/config';
import { exchangeCode } from '@/lib/dropbox';
import { clearOauthState, oauthStateOf, setRefreshToken } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL('/', request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;

  if (query.get('error')) {
    const response = back(request, {
      error: query.get('error_description') || query.get('error') || 'denied',
    });
    clearOauthState(response);
    return response;
  }

  const code = query.get('code') || '';
  const state = query.get('state') || '';

  if (!code || !state || state !== oauthStateOf(request)) {
    const response = back(request, { error: 'Invalid authorization response. Try linking again.' });
    clearOauthState(response);
    return response;
  }

  try {
    const { refreshToken } = await exchangeCode(code, callbackUrl(request.url));
    const response = back(request, { connected: '1' });
    setRefreshToken(response, refreshToken);
    clearOauthState(response);
    return response;
  } catch (error) {
    const response = back(request, {
      error: error instanceof Error ? error.message : 'Could not link Dropbox.',
    });
    clearOauthState(response);
    return response;
  }
}
