/**
 * Persists the built-in browser's login state across app restarts. Cookies for a domain are saved
 * (encrypted at rest, same codec as API keys) to `~/.cellar/browser_sessions/<domain>.json` after
 * every navigation, and reloaded into the shared session before any tab opens.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { session } from 'electron';
import type { BrowserLoginStatus } from '@shared/types/browser';
import { openSecret, sealSecret } from '../lib/secrets';
import { logger } from '../lib/log';
import { errorMessage } from '../lib/util';

const log = logger('browser-sessions');

const DIR = join(homedir(), '.cellar', 'browser_sessions');

/** Cookie names that indicate a real signed-in session rather than analytics/consent noise. */
const AUTH_COOKIE_PATTERN = /sess|auth|token|sid|login|uid|user/i;

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
}

function fileFor(domain: string): string {
  return join(DIR, `${domain.replace(/[^a-z0-9.-]/gi, '_')}.json`);
}

async function ensureDir(): Promise<void> {
  await mkdir(DIR, { recursive: true });
}

function cookieUrl(domain: string, path: string, secure: boolean): string {
  return `http${secure ? 's' : ''}://${domain.replace(/^\./, '')}${path}`;
}

/** Saves every cookie the shared session holds for `domain`. Skips localhost and domains with no cookies. */
export async function saveDomainSession(domain: string): Promise<void> {
  if (!domain || domain === 'localhost') return;
  try {
    const cookies = await session.defaultSession.cookies.get({ domain });
    if (!cookies.length) return;
    await ensureDir();
    const stored: StoredCookie[] = cookies.map((c) => ({
      name: c.name,
      value: sealSecret(c.value),
      domain: c.domain ?? domain,
      path: c.path ?? '/',
      secure: !!c.secure,
      httpOnly: !!c.httpOnly,
      expirationDate: c.expirationDate,
    }));
    await writeFile(fileFor(domain), JSON.stringify({ domain, savedAt: Date.now(), cookies: stored }), 'utf-8');
  } catch (err) {
    log.warn('could not save session', domain, errorMessage(err));
  }
}

/** Reloads every saved domain's cookies into the shared session. Call once at startup, before any tab opens. */
export async function loadAllSessions(): Promise<void> {
  try {
    await ensureDir();
    const files = await readdir(DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(await readFile(join(DIR, file), 'utf-8')) as { cookies?: StoredCookie[] };
        for (const c of raw.cookies ?? []) {
          const value = openSecret(c.value);
          if (!value) continue;
          await session.defaultSession.cookies
            .set({ url: cookieUrl(c.domain, c.path, c.secure), name: c.name, value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, expirationDate: c.expirationDate })
            .catch(() => undefined);
        }
      } catch (err) {
        log.warn('could not load session file', file, errorMessage(err));
      }
    }
  } catch (err) {
    log.warn('could not load browser sessions', errorMessage(err));
  }
}

/** Whether the shared session currently looks signed in to `domain` (a live check, not the on-disk snapshot). */
export async function loginStatus(domain: string): Promise<BrowserLoginStatus> {
  if (!domain) return 'not_logged_in';
  const cookies = await session.defaultSession.cookies.get({ domain });
  const signedIn = cookies.some((c) => AUTH_COOKIE_PATTERN.test(c.name) || c.httpOnly);
  return signedIn || cookies.length > 0 ? 'logged_in' : 'not_logged_in';
}

/** Removes a domain's cookies from the live session and its saved snapshot. */
export async function clearDomainSession(domain: string): Promise<void> {
  const cookies = await session.defaultSession.cookies.get({ domain });
  for (const c of cookies) await session.defaultSession.cookies.remove(cookieUrl(c.domain ?? domain, c.path ?? '/', !!c.secure), c.name).catch(() => undefined);
  await rm(fileFor(domain), { force: true }).catch(() => undefined);
}
