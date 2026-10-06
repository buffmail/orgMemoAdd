import { NextResponse } from 'next/server';

import { clearRefreshToken } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearRefreshToken(response);

  return response;
}
