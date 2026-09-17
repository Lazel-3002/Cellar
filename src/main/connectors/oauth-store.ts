/** Saved OAuth state for remote MCP connectors: registered client info, tokens and PKCE state, encrypted at rest. */
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import { get, run } from '../db/client';
import { openSecret, sealSecret } from '../lib/secrets';
import { safeJsonParse } from '../lib/util';

interface Row {
  connector_id: string;
  client_info: string;
  tokens: string;
  code_verifier: string;
  discovery_state: string;
}

export interface OAuthState {
  clientInformation?: OAuthClientInformationFull;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
}

function row(connectorId: string): Row | undefined {
  return get<Row>('SELECT * FROM connector_oauth WHERE connector_id = ?', connectorId);
}

export function loadOAuthState(connectorId: string): OAuthState {
  const r = row(connectorId);
  if (!r) return {};
  return {
    clientInformation: safeJsonParse<OAuthClientInformationFull | undefined>(openSecret(r.client_info), undefined),
    tokens: safeJsonParse<OAuthTokens | undefined>(openSecret(r.tokens), undefined),
    codeVerifier: openSecret(r.code_verifier) || undefined,
    discoveryState: safeJsonParse<OAuthDiscoveryState | undefined>(openSecret(r.discovery_state), undefined),
  };
}

function upsert(connectorId: string, patch: Partial<Row>): void {
  const existing = row(connectorId);
  const next: Row = { connector_id: connectorId, client_info: '', tokens: '', code_verifier: '', discovery_state: '', ...existing, ...patch };
  run(
    `INSERT INTO connector_oauth (connector_id, client_info, tokens, code_verifier, discovery_state, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(connector_id) DO UPDATE SET client_info = excluded.client_info, tokens = excluded.tokens, code_verifier = excluded.code_verifier, discovery_state = excluded.discovery_state, updated_at = excluded.updated_at`,
    next.connector_id,
    next.client_info,
    next.tokens,
    next.code_verifier,
    next.discovery_state,
    Date.now(),
  );
}

export function saveClientInformation(connectorId: string, info: OAuthClientInformationFull): void {
  upsert(connectorId, { client_info: sealSecret(JSON.stringify(info)) });
}

export function saveTokens(connectorId: string, tokens: OAuthTokens): void {
  upsert(connectorId, { tokens: sealSecret(JSON.stringify(tokens)) });
}

export function saveCodeVerifier(connectorId: string, verifier: string): void {
  upsert(connectorId, { code_verifier: sealSecret(verifier) });
}

export function saveDiscoveryState(connectorId: string, state: OAuthDiscoveryState): void {
  upsert(connectorId, { discovery_state: sealSecret(JSON.stringify(state)) });
}

/** Forgets everything for a connector (sign out, or the connector was deleted). */
export function clearOAuthState(connectorId: string, scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery' = 'all'): void {
  if (scope === 'all') {
    run('DELETE FROM connector_oauth WHERE connector_id = ?', connectorId);
    return;
  }
  const column = { client: 'client_info', tokens: 'tokens', verifier: 'code_verifier', discovery: 'discovery_state' }[scope];
  run(`UPDATE connector_oauth SET ${column} = '' WHERE connector_id = ?`, connectorId);
}

export function hasOAuthTokens(connectorId: string): boolean {
  const r = row(connectorId);
  return !!r?.tokens;
}
