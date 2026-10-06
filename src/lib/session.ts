import { timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

import { APP_PASSCODE, DROPBOX_REFRESH_TOKEN } from './config';

export const REFRESH_COOKIE = 'orgmemo_refresh';
export const PASSCODE_COOKIE = 'orgmemo_pass';
export const STATE_COOKIE = 'orgmemo_state';

const YEAR_SECONDS = 60 * 60 * 24 * 365;

function baseCookie(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

export function setRefreshToken(response: NextResponse, token: string) {
  response.cookies.set(REFRESH_COOKIE, token, baseCookie(YEAR_SECONDS));
}

export function clearRefreshToken(response: NextResponse) {
  response.cookies.set(REFRESH_COOKIE, '', baseCookie(0));
}

export function setOauthState(response: NextResponse, state: string) {
  response.cookies.set(STATE_COOKIE, state, baseCookie(600));
}

export function clearOauthState(response: NextResponse) {
  response.cookies.set(STATE_COOKIE, '', baseCookie(0));
}

export function setPasscode(response: NextResponse, passcode: string) {
  response.cookies.set(PASSCODE_COOKIE, passcode, baseCookie(YEAR_SECONDS));
}

/**
 * The browser-linked token wins over the one baked into the environment, so a
 * freshly linked account takes effect without a redeploy.
 */
export function refreshTokenOf(request: NextRequest): string {
  return request.cookies.get(REFRESH_COOKIE)?.value || DROPBOX_REFRESH_TOKEN;
}

export function oauthStateOf(request: NextRequest): string {
  return request.cookies.get(STATE_COOKIE)?.value || '';
}

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Without APP_PASSCODE the app is open; with it, every write needs the passcode. */
export function isLocked(request: NextRequest): boolean {
  if (!APP_PASSCODE) return false;
  return !equals(request.cookies.get(PASSCODE_COOKIE)?.value || '', APP_PASSCODE);
}

export function passcodeMatches(candidate: string): boolean {
  return Boolean(APP_PASSCODE) && equals(candidate, APP_PASSCODE);
}
