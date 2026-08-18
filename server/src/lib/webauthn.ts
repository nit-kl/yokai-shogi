/* WebAuthn(パスキー)共通: RP解決・チャレンジ保管・資格情報の読み書き */

import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import type { Env } from '../env';

const RP_NAME = '百鬼盤';
const CHALLENGE_TTL_MS = 5 * 60_000;

export function rpName(): string {
  return RP_NAME;
}

/** Origin ヘッダから RP ID を決定。許可外なら null */
export function resolveRp(env: Env, originHeader: string | undefined): { origin: string; rpID: string } | null {
  if (!originHeader) return null;
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(originHeader)) return null;
  let host: string;
  try { host = new URL(originHeader).hostname; }
  catch { return null; }
  if (!host) return null;
  return { origin: originHeader, rpID: host };
}

export async function saveChallenge(
  db: D1Database,
  challenge: string,
  purpose: 'register' | 'authenticate',
  userId: string | null,
): Promise<void> {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  await db.prepare(
    'INSERT INTO webauthn_challenges (challenge, user_id, purpose, expires_at) VALUES (?1, ?2, ?3, ?4)',
  ).bind(challenge, userId, purpose, expiresAt).run();
}

export async function consumeChallenge(
  db: D1Database,
  challenge: string,
  purpose: 'register' | 'authenticate',
): Promise<{ userId: string | null } | null> {
  const row = await db
    .prepare(
      'SELECT user_id, expires_at FROM webauthn_challenges WHERE challenge = ?1 AND purpose = ?2',
    )
    .bind(challenge, purpose)
    .first<{ user_id: string | null; expires_at: string }>();
  if (!row) return null;
  await db.prepare('DELETE FROM webauthn_challenges WHERE challenge = ?1').bind(challenge).run();
  if (row.expires_at < new Date().toISOString()) return null;
  return { userId: row.user_id };
}

export async function cleanupExpiredChallenges(db: D1Database): Promise<number> {
  const r = await db.prepare(
    "DELETE FROM webauthn_challenges WHERE expires_at < datetime('now')",
  ).run();
  return r.meta.changes ?? 0;
}

export interface StoredPasskey {
  credentialId: string;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports: AuthenticatorTransportFuture[] | undefined;
  userId: string;
}

export function toUint8Array(value: unknown): Uint8Array<ArrayBuffer> {
  if (value instanceof Uint8Array) return new Uint8Array(value) as Uint8Array<ArrayBuffer>;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)) as Uint8Array<ArrayBuffer>;
  }
  throw new Error('invalid public_key blob');
}

export function parseTransports(raw: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return undefined;
    return v.filter((t): t is AuthenticatorTransportFuture => typeof t === 'string');
  } catch {
    return undefined;
  }
}

export async function listPasskeys(db: D1Database, userId: string): Promise<StoredPasskey[]> {
  const res = await db
    .prepare(
      "SELECT subject, public_key, counter, transports, user_id FROM auth_identities WHERE user_id = ?1 AND provider = 'passkey'",
    )
    .bind(userId)
    .all<{ subject: string; public_key: ArrayBuffer; counter: number | null; transports: string | null; user_id: string }>();
  return (res.results || []).map(r => ({
    credentialId: r.subject,
    publicKey: toUint8Array(r.public_key),
    counter: r.counter ?? 0,
    transports: parseTransports(r.transports),
    userId: r.user_id,
  }));
}

export async function findPasskey(db: D1Database, credentialId: string): Promise<StoredPasskey | null> {
  const row = await db
    .prepare(
      "SELECT subject, public_key, counter, transports, user_id FROM auth_identities WHERE provider = 'passkey' AND subject = ?1",
    )
    .bind(credentialId)
    .first<{ subject: string; public_key: ArrayBuffer; counter: number | null; transports: string | null; user_id: string }>();
  if (!row || !row.public_key) return null;
  return {
    credentialId: row.subject,
    publicKey: toUint8Array(row.public_key),
    counter: row.counter ?? 0,
    transports: parseTransports(row.transports),
    userId: row.user_id,
  };
}

export async function userHasPasskey(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM auth_identities WHERE user_id = ?1 AND provider = 'passkey' LIMIT 1")
    .bind(userId)
    .first<{ ok: number }>();
  return !!row;
}
