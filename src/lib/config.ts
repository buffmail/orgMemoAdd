/**
 * All deployment-specific values live here and come from environment variables.
 * Copy .env.local.example to .env.local (local) or set them in the Vercel
 * project settings (production). Nothing secret is hardcoded.
 */

export const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY || 'h1hbkipv02vmg9k';
export const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET || '';
/**
 * Relative to the app folder for an App-folder app, so `/life.org` means
 * `/앱/DavidNote/life.org` in the user's Dropbox. A Full-Dropbox app would need
 * the absolute path instead.
 */
export const DROPBOX_FILE_PATH = process.env.DROPBOX_FILE_PATH || '/life.org';
export const DROPBOX_REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN || '';
export const APP_PASSCODE = process.env.APP_PASSCODE || '';
/**
 * Dropbox matches redirect_uri exactly, so it must be one fixed string. Derived
 * from the request by default; pin it with PUBLIC_BASE_URL on Vercel, where each
 * preview deployment otherwise produces a URL that is not registered.
 */
export const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';

export function callbackUrl(requestUrl: string): string {
  return new URL('/api/auth/callback', PUBLIC_BASE_URL || requestUrl).toString();
}
