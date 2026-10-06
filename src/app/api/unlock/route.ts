import { NextResponse } from 'next/server';

import { passcodeMatches, setPasscode } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { passcode } = (await request.json().catch(() => ({}))) as { passcode?: string };

  if (!passcode || !passcodeMatches(passcode)) {
    return NextResponse.json({ error: 'Wrong passcode.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  setPasscode(response, passcode);

  return response;
}
