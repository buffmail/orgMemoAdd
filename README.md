# org memo

A one-box web app: type a memo, press Append, and it lands at the end of
`/앱/DavidNote/life.org` in Dropbox. Next.js App Router, deploys to Vercel, no
database.

The Dropbox app is an **App folder** app whose folder *is* `/앱/DavidNote`, so the
API path is `/life.org` — relative to that folder, not an absolute Dropbox path.
Setting `DROPBOX_FILE_PATH=/앱/DavidNote/life.org` would silently create
`/앱/DavidNote/앱/DavidNote/life.org` instead.

## Where the secrets live

| Credential | Where it goes | Why |
| --- | --- | --- |
| App key (`h1hbkipv02vmg9k`) | source default, overridable by env | public identifier, not a secret |
| App secret | `DROPBOX_APP_SECRET` env var, server only | it authenticates the *app*; in a browser it would be readable by anyone |
| Refresh token (per account) | httpOnly cookie after linking, or `DROPBOX_REFRESH_TOKEN` env var | it authenticates *your account*; the cookie keeps writes limited to browsers you linked |

The app secret is never shipped to the browser and never written to the repo.
Set it in `.env.local` for local dev and in the Vercel dashboard for production.

## Dropbox app setup

At <https://www.dropbox.com/developers/apps/info?app_key=h1hbkipv02vmg9k>:

1. **Permissions** tab — enable `files.content.read` and `files.content.write`,
   then Submit. `account_info.read` is optional: it only lets the page name the
   linked account, and appending works without it. Do this *before* linking;
   Dropbox bakes the permissions into the token at authorize time. A legacy
   (pre-scoped) app has no Permissions tab and already has full access.
2. **Settings → OAuth 2 → Redirect URIs** — add both:
   - `http://localhost:3000/api/auth/callback`
   - `https://<your-app>.vercel.app/api/auth/callback`
3. **Settings → Permission type** — this app is **App folder**, scoped to
   `/앱/DavidNote`. That is why `DROPBOX_FILE_PATH` is `/life.org`. Only switch to
   an absolute path if you move the app to Full Dropbox.
4. Copy the **App secret**.

The authorize request deliberately sends no `scope` parameter. A legacy app rejects
it (`"scope": must be at most 0 characters`), and a scoped app without it grants
everything on the Permissions tab — so omitting it is right for both.

## Local run

```bash
nvm use            # Node 22 (see .nvmrc)
npm install
cp .env.local.example .env.local   # then paste DROPBOX_APP_SECRET
npm run dev
```

Open <http://localhost:3000>, click **Link Dropbox**, approve, and the memo box
appears. `⌘/Ctrl + Enter` appends.

## Deploy to Vercel

```bash
npx vercel          # first run links the project
npx vercel --prod
```

The Node version is pinned to 22 by `engines.node` in `package.json`, which is
what Vercel reads — it ignores `.nvmrc`, which is there for local `nvm use`.

Or import `buffmail/orgMemoAdd` at <https://vercel.com/new>. Either way, add the
environment variables (at least `DROPBOX_APP_SECRET`) under Project → Settings →
Environment Variables, add the production callback URL to the Dropbox app, and
redeploy — Vercel only picks up new env values on a fresh deployment.

Set `PUBLIC_BASE_URL` to the production origin there too. Without it the app sends
whatever URL the request arrived on, so every preview deployment produces an
unregistered redirect URI and linking fails with *Invalid redirect_uri*. The Link
screen always prints the exact string the app will send — register that verbatim.

## What gets written

Each memo is appended as a blank line followed by `memo: `, matching the `note: `
entries already in the file. No timestamp.

```org
- [ ] core: make real brand video. solifant.

memo: 전세 만기 확인
```

To change the shape, edit `formatEntry` in `src/lib/org.ts`.

Once linked, the page also shows the `memo:` and `note:` lines already at the end
of the file. It reads backwards from the end and stops at the first bullet or org
heading above them, so you see only the entries belonging to the current subject —
`recentEntries` in `src/lib/org.ts`.

Dropbox has no append API, so `src/lib/dropbox.ts` downloads the file and writes it
back with `mode=update` pinned to the revision it read, plus `strict_conflict`.
A concurrent write therefore fails loudly and is retried against the new revision
instead of silently forking the file into a `life.org (conflicted copy)`.

## Environment variables

| Variable | Required | Default |
| --- | --- | --- |
| `DROPBOX_APP_SECRET` | yes | — |
| `DROPBOX_APP_KEY` | no | `h1hbkipv02vmg9k` |
| `DROPBOX_FILE_PATH` | no | `/life.org` (relative to the app folder) |
| `PUBLIC_BASE_URL` | no | derived from the request |
| `APP_PASSCODE` | no | unset (app is open to whoever has linked a Dropbox) |
| `DROPBOX_REFRESH_TOKEN` | no | unset (link from the browser instead) |

A deployed URL is guessable. Without `APP_PASSCODE`, a visitor still cannot write
anything unless they link their *own* Dropbox — writes go to whatever account the
caller's cookie holds. But if you set `DROPBOX_REFRESH_TOKEN` on the server, every
visitor inherits your account, so set `APP_PASSCODE` as well; the app warns on
screen when that combination is missing.

### Getting a refresh token for the server

Only needed if you want every device to work without linking:

```bash
node scripts/get-refresh-token.mjs
```

It listens on the callback URL the app already uses, prints the authorize link,
and writes `DROPBOX_REFRESH_TOKEN=…` to the terminal. Paste it into `.env.local`
and into Vercel — along with `APP_PASSCODE`.

## Icon

`src/app/icon.svg` is the browser icon and `src/app/apple-icon.png` (180x180) the
iOS home-screen icon; Next picks both up by filename, so no metadata wiring. The
apple icon is deliberately full-bleed because iOS applies its own rounded mask,
which would otherwise double-round the corners. Regenerate the PNG after editing
the SVG:

```bash
rsvg-convert -w 180 -h 180 src/app/icon.svg -o src/app/apple-icon.png   # then remove the rx on the rect
```

## Routes

| Route | Purpose |
| --- | --- |
| `GET /api/status` | what the UI needs: configured, linked, locked, account, path |
| `GET /api/auth/start` | redirect to Dropbox authorize (`token_access_type=offline`) |
| `GET /api/auth/callback` | exchange the code, store the refresh token in a cookie |
| `POST /api/auth/disconnect` | drop the cookie |
| `POST /api/unlock` | exchange the passcode for a cookie |
| `POST /api/append` | `{ memo }` → appended to the org file |
| `GET /api/recent` | the `memo:`/`note:` lines at the end of the file, back to the last bullet or heading |
| `GET /api/diagnose` | what the app can actually see: app-folder listing, target metadata, `life.org` search — open it in a linked browser when a write seems to vanish |
