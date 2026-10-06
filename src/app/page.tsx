'use client';

import { useCallback, useEffect, useState } from 'react';

type Status = {
  secretConfigured: boolean;
  passcodeRequired: boolean;
  locked: boolean;
  connected: boolean;
  openToAnyone: boolean;
  callbackUrl: string;
  path: string;
  account: { name: string; email: string } | null;
  accountError: string | null;
};

type Entry = { kind: 'memo' | 'note'; text: string };

type Message = { kind: 'ok' | 'err'; text: string } | null;

export default function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [memo, setMemo] = useState('');
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      setStatus((await response.json()) as Status);
    } catch {
      setMessage({ kind: 'err', text: 'Could not reach the server.' });
    }
  }, []);

  const loadEntries = useCallback(async () => {
    try {
      const response = await fetch('/api/recent', { cache: 'no-store' });
      const { entries: loaded } = await response.json();
      setEntries(response.ok ? loaded : []);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    if (status?.connected && !status.locked) void loadEntries();
  }, [status?.connected, status?.locked, loadEntries]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const error = query.get('error');
    if (error) setMessage({ kind: 'err', text: error });
    else if (query.get('connected')) setMessage({ kind: 'ok', text: 'Dropbox linked.' });
    if (error || query.get('connected')) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    void loadStatus();
  }, [loadStatus]);

  const unlock = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      if (!response.ok) {
        const { error } = await response.json();
        setMessage({ kind: 'err', text: error });
        return;
      }
      setPasscode('');
      setMessage(null);
      await loadStatus();
    } finally {
      setBusy(false);
    }
  };

  const append = async () => {
    if (!memo.trim() || busy) return;

    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo }),
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage({ kind: 'err', text: result.error ?? 'Append failed.' });
        if (result.needsAuth || result.locked) await loadStatus();
        return;
      }

      setMemo('');
      setMessage({ kind: 'ok', text: `Appended to ${result.path} (${result.size} bytes)` });
      void loadEntries();
    } catch {
      setMessage({ kind: 'err', text: 'Could not reach the server.' });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setEntries([]);
    setBusy(true);
    try {
      await fetch('/api/auth/disconnect', { method: 'POST' });
      setMessage(null);
      await loadStatus();
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void append();
    }
  };

  return (
    <main>
      <header>
        <h1>org memo</h1>
        <span className="path">{status?.path ?? '…'}</span>
      </header>

      {message && <p className={`notice ${message.kind}`}>{message.text}</p>}

      {status && !status.secretConfigured && (
        <p className="notice warn">
          <code>DROPBOX_APP_SECRET</code> is not set. Put it in <code>.env.local</code>{' '}
          locally, or in the Vercel project&apos;s environment variables, then reload.
        </p>
      )}

      {status?.openToAnyone && (
        <p className="notice warn">
          A server-side <code>DROPBOX_REFRESH_TOKEN</code> is set without{' '}
          <code>APP_PASSCODE</code>, so anyone who opens this URL can write to your
          Dropbox. Set a passcode.
        </p>
      )}

      {status?.accountError && (
        <p className="notice err">Dropbox rejected the stored link: {status.accountError}</p>
      )}

      {status && status.passcodeRequired && status.locked ? (
        <section className="panel">
          <label className="hint" htmlFor="passcode">
            Passcode
          </label>
          <div className="row">
            <input
              id="passcode"
              type="password"
              value={passcode}
              autoFocus
              onChange={(event) => setPasscode(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void unlock()}
            />
            <button type="button" onClick={unlock} disabled={busy || !passcode}>
              Unlock
            </button>
          </div>
        </section>
      ) : status && !status.connected ? (
        <section className="panel">
          <p className="hint">
            Link the Dropbox account that holds <code>{status.path}</code>.
          </p>
          <p className="hint">
            Redirect URI to register in the Dropbox app:{' '}
            <code>{status.callbackUrl}</code>
          </p>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                window.location.href = '/api/auth/start';
              }}
              disabled={!status.secretConfigured}
            >
              Link Dropbox
            </button>
          </div>
        </section>
      ) : (
        <section className="panel">
          <textarea
            value={memo}
            placeholder="메모를 입력하세요…"
            autoFocus
            onChange={(event) => setMemo(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!status}
          />
          <div className="row spread">
            <span className="hint">⌘/Ctrl + Enter to append</span>
            <button type="button" onClick={append} disabled={busy || !memo.trim()}>
              {busy ? 'Appending…' : 'Append'}
            </button>
          </div>
        </section>
      )}

      {entries.length > 0 && (
        <section className="entries">
          {entries.map((entry, index) => (
            <p key={index} className="entry">
              <span className={`kind ${entry.kind}`}>{entry.kind}:</span>{' '}
              {entry.text}
            </p>
          ))}
        </section>
      )}

      {status?.connected && !status.locked && (
        <div className="row spread">
          <span className="account">
            {status.account
              ? `${status.account.name} · ${status.account.email}`
              : 'Dropbox linked'}
          </span>
          <button type="button" className="secondary" onClick={disconnect} disabled={busy}>
            Unlink
          </button>
        </div>
      )}
    </main>
  );
}
