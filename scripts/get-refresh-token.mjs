/**
 * Prints a long-lived Dropbox refresh token for DROPBOX_REFRESH_TOKEN.
 *
 *   node scripts/get-refresh-token.mjs
 *
 * Listens on the same callback URL the app uses, so no extra redirect URI has to
 * be registered. Needs DROPBOX_APP_SECRET in the environment or in .env.local.
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3000);
const CALLBACK_PATH = '/api/auth/callback';

function fromEnvFile(name) {
  try {
    const line = readFileSync(join(ROOT, '.env.local'), 'utf8')
      .split('\n')
      .find((candidate) => candidate.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : '';
  } catch {
    return '';
  }
}

const appKey = process.env.DROPBOX_APP_KEY || fromEnvFile('DROPBOX_APP_KEY') || 'h1hbkipv02vmg9k';
const appSecret = process.env.DROPBOX_APP_SECRET || fromEnvFile('DROPBOX_APP_SECRET');

if (!appSecret) {
  console.error('DROPBOX_APP_SECRET is not set. Put it in .env.local or export it.');
  process.exit(1);
}

const redirectUri = `http://localhost:${PORT}${CALLBACK_PATH}`;
const state = randomUUID();

const authorizeUrl =
  'https://www.dropbox.com/oauth2/authorize?' +
  new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    redirect_uri: redirectUri,
    token_access_type: 'offline',
    state,
  });

async function exchange(code) {
  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: appKey,
      client_secret: appSecret,
    }),
  });

  const body = await response.text();
  if (!response.ok) throw new Error(body);

  return JSON.parse(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  if (url.pathname !== CALLBACK_PATH) {
    response.writeHead(404).end();
    return;
  }

  const finish = (message) => {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message);
    server.close();
  };

  if (url.searchParams.get('state') !== state) {
    finish('State mismatch. Run the script again.');
    process.exitCode = 1;
    return;
  }

  try {
    const token = await exchange(url.searchParams.get('code') || '');
    console.log('\nDROPBOX_REFRESH_TOKEN=' + token.refresh_token);
    console.log('\nPaste that into .env.local and into the Vercel environment variables.');
    console.log('Set APP_PASSCODE as well - a server-side token lets any visitor write.\n');
    finish('Done. The refresh token was printed in your terminal.');
  } catch (error) {
    console.error('\nToken exchange failed:', error.message);
    finish('Token exchange failed. Check the terminal.');
    process.exitCode = 1;
  }
});

server.listen(PORT, () => {
  console.log(`Register ${redirectUri} in the Dropbox app if you have not already.`);
  console.log('\nOpen this URL, approve, and come back:\n');
  console.log(authorizeUrl + '\n');
});
