/**
 * OAuth sign-in for remote MCP servers (Streamable HTTP / SSE), per the MCP auth spec: dynamic client
 * registration, PKCE authorization code flow, and refresh. Cellar opens the authorization URL in the
 * user's browser and catches the redirect with a small loopback HTTP server.
 */
import { createServer, type Server } from 'node:http';
import { shell } from 'electron';
import type { OAuthClientProvider, OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationFull, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { logger } from '../lib/log';
import { clearOAuthState, loadOAuthState, saveClientInformation, saveCodeVerifier, saveDiscoveryState, saveTokens } from './oauth-store';

const log = logger('connectors-oauth');

/** Loopback port the callback server listens on; MCP servers registering a client see this in the redirect URI. */
const CALLBACK_PORT = 51823;

let server: Server | null = null;
const pending = new Map<string, { resolve: (code: string) => void; reject: (err: Error) => void }>();

function callbackPath(connectorId: string): string {
  return `/oauth/${connectorId}`;
}

/** Starts the shared loopback server the first time it is needed. */
function ensureServer(): Promise<void> {
  if (server) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${CALLBACK_PORT}`);
      const connectorId = decodeURIComponent(url.pathname.replace(/^\/oauth\//, ''));
      const waiter = pending.get(connectorId);
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (!waiter) {
        res.end('<!doctype html><title>Cellar</title><body style="font:14px system-ui;padding:2em">This sign-in link is no longer waiting for a response. You can close this tab.</body>');
        return;
      }
      pending.delete(connectorId);
      if (error || !code) {
        res.end(`<!doctype html><title>Cellar</title><body style="font:14px system-ui;padding:2em">Sign-in failed${error ? `: ${error}` : ''}. Close this tab and try again in Cellar.</body>`);
        waiter.reject(new Error(error || 'The server did not return an authorization code.'));
        return;
      }
      res.end('<!doctype html><title>Cellar</title><body style="font:14px system-ui;padding:2em">Signed in. You can close this tab and return to Cellar.</body>');
      waiter.resolve(code);
    });
    s.once('error', reject);
    s.listen(CALLBACK_PORT, '127.0.0.1', () => {
      s.off('error', reject);
      s.on('error', (err) => log.warn('callback server error', err));
      server = s;
      resolve();
    });
  });
}

/** Waits for the authorization code Cellar catches at the loopback redirect URI. */
function waitForCallback(connectorId: string, timeoutMs = 5 * 60_000): Promise<string> {
  return ensureServer().then(
    () =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(connectorId);
          reject(new Error('Sign-in timed out. Try again.'));
        }, timeoutMs);
        pending.set(connectorId, {
          resolve: (code) => {
            clearTimeout(timer);
            resolve(code);
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        });
      }),
  );
}

/** The URL an OAuth attempt is waiting to redirect the user to, for a manual "Open sign-in" link. */
const lastAuthUrl = new Map<string, string>();

export function authUrlFor(connectorId: string): string | undefined {
  return lastAuthUrl.get(connectorId);
}

export class CellarOAuthProvider implements OAuthClientProvider {
  constructor(
    private readonly connectorId: string,
    private readonly serverName: string,
  ) {}

  get redirectUrl(): string {
    return `http://127.0.0.1:${CALLBACK_PORT}${callbackPath(this.connectorId)}`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Cellar',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  clientInformation(): OAuthClientInformationFull | undefined {
    return loadOAuthState(this.connectorId).clientInformation;
  }

  saveClientInformation(info: OAuthClientInformationFull): void {
    saveClientInformation(this.connectorId, info);
  }

  tokens(): OAuthTokens | undefined {
    return loadOAuthState(this.connectorId).tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    saveTokens(this.connectorId, tokens);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    lastAuthUrl.set(this.connectorId, authorizationUrl.toString());
    await ensureServer();
    log.info(`opening browser to sign in to ${this.serverName}`);
    await shell.openExternal(authorizationUrl.toString());
  }

  saveCodeVerifier(verifier: string): void {
    saveCodeVerifier(this.connectorId, verifier);
  }

  codeVerifier(): string {
    const verifier = loadOAuthState(this.connectorId).codeVerifier;
    if (!verifier) throw new Error('No PKCE code verifier saved for this sign-in.');
    return verifier;
  }

  saveDiscoveryState(state: OAuthDiscoveryState): void {
    saveDiscoveryState(this.connectorId, state);
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return loadOAuthState(this.connectorId).discoveryState;
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
    clearOAuthState(this.connectorId, scope);
  }

  /** Waits for the browser redirect and returns the authorization code. */
  waitForCode(): Promise<string> {
    return waitForCallback(this.connectorId);
  }
}

export function forgetOAuth(connectorId: string): void {
  clearOAuthState(connectorId, 'all');
  lastAuthUrl.delete(connectorId);
}

export function closeOAuthServer(): void {
  server?.close();
  server = null;
}
