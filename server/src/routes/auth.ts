/* 認証: ゲスト発行・トークン更新・引き継ぎコード・パスキー(doc 06)
   Google OAuth は将来候補 */

import { Hono } from 'hono';
import { z } from 'zod';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { AppEnv, Env } from '../env';
import { apiError } from '../lib/errors';
import { signJwt } from '../lib/jwt';
import { genLinkCode, normalizeLinkCode, randomToken, sha256b64url } from '../lib/crypto';
import { currencyLogStmt, DEFAULT_FORMATION, FIRST_BONUS } from '../db';
import { authRequired } from '../middleware';
import {
  consumeChallenge,
  findPasskey,
  listPasskeys,
  resolveRp,
  rpName,
  saveChallenge,
} from '../lib/webauthn';

const ACCESS_TTL_SEC = 15 * 60;          // 15分(doc 06)
const REFRESH_TTL_MS = 90 * 86400e3;     // 90日

/* ---------- IPレート制限(isolateメモリ・ベストエフォート)
   本番はCloudflare WAFのRate Limitingルールを一段目として併用する(doc 04/07) ---------- */
const rateBuckets = new Map<string, number[]>();
function rateLimited(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (rateBuckets.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) { rateBuckets.set(key, arr); return true; }
  arr.push(now);
  rateBuckets.set(key, arr);
  if (rateBuckets.size > 10_000) rateBuckets.clear(); // メモリ上限の安全弁
  return false;
}

/* ---------- Turnstile検証(シークレット未設定ならスキップ=ローカル開発) ---------- */
async function verifyTurnstile(env: Env, token: string | undefined, ip: string | undefined): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
  });
  const data: { success: boolean; action?: string } =
    await res.json<{ success: boolean; action?: string }>().catch(() => ({ success: false }));
  return !!data.success && data.action === 'guest-account';
}

/* ---------- トークン発行 ---------- */
export async function issueTokens(env: Env, userId: string, isGuest: boolean, familyId?: string) {
  const refreshToken = randomToken(32);
  const tokenHash = await sha256b64url(refreshToken);
  const family = familyId ?? crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
  await env.DB
    .prepare('INSERT INTO refresh_tokens (token_hash, user_id, family_id, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(tokenHash, userId, family, expiresAt)
    .run();
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await signJwt({ sub: userId, iat: now, exp: now + ACCESS_TTL_SEC, guest: isGuest }, env.JWT_SECRET);
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SEC };
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.get('/auth/config', c => c.json({
  turnstileRequired: !!c.env.TURNSTILE_SECRET_KEY,
  ...(c.env.TURNSTILE_SECRET_KEY ? { turnstileSiteKey: c.env.TURNSTILE_SITE_KEY } : {}),
  passkeyEnabled: true,
}));

/* ---------- ゲスト作成 ---------- */
const guestSchema = z.object({ turnstileToken: z.string().max(4096).optional() });

authRoutes.post('/auth/guest', async c => {
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  if (rateLimited(`guest:${ip}`, 5)) return apiError(c, 'RATE_LIMITED', 'しばらく待ってからお試しください');

  const body = guestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return apiError(c, 'VALIDATION', 'リクエストが不正です');
  if (c.env.TURNSTILE_SECRET_KEY && !c.env.TURNSTILE_SITE_KEY) {
    return apiError(c, 'INTERNAL', 'bot検証のサーバー設定が不足しています');
  }
  if (!(await verifyTurnstile(c.env, body.data.turnstileToken, ip))) {
    return apiError(c, 'VALIDATION', 'bot検証に失敗しました');
  }

  const userId = crypto.randomUUID();
  const db = c.env.DB;
  const stmts = [
    db.prepare('INSERT INTO users (id, is_guest) VALUES (?1, 1)').bind(userId),
    db.prepare('INSERT INTO user_profiles (user_id, tickets, formation, onboarding_done) VALUES (?1, ?2, ?3, 0)')
      .bind(userId, FIRST_BONUS, JSON.stringify(DEFAULT_FORMATION)),
    currencyLogStmt(db, userId, 'tickets', FIRST_BONUS, FIRST_BONUS, 'initial'),
  ];
  await db.batch(stmts);

  const tokens = await issueTokens(c.env, userId, true);
  return c.json({ userId, ...tokens }, 201);
});

/* ---------- トークン更新(ローテーション+再利用検知: doc 06) ---------- */
const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });

authRoutes.post('/auth/refresh', async c => {
  const body = refreshSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return apiError(c, 'VALIDATION', 'リクエストが不正です');

  const db = c.env.DB;
  const hash = await sha256b64url(body.data.refreshToken);
  const row = await db
    .prepare('SELECT r.user_id, r.family_id, r.expires_at, r.used_at, u.is_guest, u.status FROM refresh_tokens r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ?1')
    .bind(hash)
    .first<{ user_id: string; family_id: string; expires_at: string; used_at: string | null; is_guest: number; status: string }>();

  if (!row) return apiError(c, 'UNAUTHORIZED', 'トークンが無効です');
  if (row.used_at) {
    /* 使用済みトークンの再提示 = 盗難疑い → 系列ごと失効 */
    await db.prepare('DELETE FROM refresh_tokens WHERE family_id = ?1').bind(row.family_id).run();
    return apiError(c, 'UNAUTHORIZED', 'トークンが無効です(再ログインしてください)');
  }
  if (row.expires_at < new Date().toISOString()) return apiError(c, 'UNAUTHORIZED', 'トークンの期限が切れています');
  if (row.status !== 'active') return apiError(c, 'BANNED', 'このアカウントは利用停止されています');

  await db.prepare("UPDATE refresh_tokens SET used_at = datetime('now') WHERE token_hash = ?1").bind(hash).run();
  const tokens = await issueTokens(c.env, row.user_id, !!row.is_guest, row.family_id);
  return c.json({ userId: row.user_id, ...tokens });
});

/* ---------- 引き継ぎコード発行(要認証) ---------- */
authRoutes.post('/auth/link-code', authRequired, async c => {
  const userId = c.get('userId');
  const code = genLinkCode();
  const hash = await sha256b64url(code);
  const db = c.env.DB;
  await db.batch([
    /* 再発行で旧コードは無効化 */
    db.prepare("DELETE FROM auth_identities WHERE user_id = ?1 AND provider = 'link_code'").bind(userId),
    db.prepare("INSERT INTO auth_identities (user_id, provider, subject) VALUES (?1, 'link_code', ?2)").bind(userId, hash),
    /* コード保有者は復元可能なので休眠削除の対象外にする */
    db.prepare('UPDATE users SET is_guest = 0 WHERE id = ?1').bind(userId),
  ]);
  return c.json({ code });
});

/* ---------- 引き継ぎコードでログイン ---------- */
const linkLoginSchema = z.object({ code: z.string().min(10).max(40) });

authRoutes.post('/auth/login/link-code', async c => {
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  if (rateLimited(`linklogin:${ip}`, 5)) return apiError(c, 'RATE_LIMITED', 'しばらく待ってからお試しください');

  const body = linkLoginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return apiError(c, 'VALIDATION', 'コードの形式が不正です');

  const hash = await sha256b64url(normalizeLinkCode(body.data.code));
  const row = await c.env.DB
    .prepare("SELECT a.user_id, u.is_guest, u.status FROM auth_identities a JOIN users u ON u.id = a.user_id WHERE a.provider = 'link_code' AND a.subject = ?1")
    .bind(hash)
    .first<{ user_id: string; is_guest: number; status: string }>();

  if (!row) return apiError(c, 'UNAUTHORIZED', '引き継ぎコードが見つかりません');
  if (row.status !== 'active') return apiError(c, 'BANNED', 'このアカウントは利用停止されています');

  const tokens = await issueTokens(c.env, row.user_id, !!row.is_guest);
  return c.json({ userId: row.user_id, ...tokens });
});

/* ---------- パスキー登録オプション(要認証) ---------- */
authRoutes.post('/auth/passkey/register/options', authRequired, async c => {
  const rp = resolveRp(c.env, c.req.header('Origin'));
  if (!rp) return apiError(c, 'VALIDATION', '許可されていないオリジンです');

  const userId = c.get('userId');
  const db = c.env.DB;
  const profile = await db.prepare('SELECT name FROM user_profiles WHERE user_id = ?1')
    .bind(userId).first<{ name: string }>();
  const existing = await listPasskeys(db, userId);

  const options = await generateRegistrationOptions({
    rpName: rpName(),
    rpID: rp.rpID,
    userName: userId,
    userDisplayName: profile?.name || 'プレイヤー',
    userID: new TextEncoder().encode(userId) as Uint8Array<ArrayBuffer>,
    attestationType: 'none',
    excludeCredentials: existing.map(p => ({
      id: p.credentialId,
      transports: p.transports,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  await saveChallenge(db, options.challenge, 'register', userId);
  return c.json(options);
});

/* ---------- パスキー登録完了(要認証) ---------- */
authRoutes.post('/auth/passkey/register', authRequired, async c => {
  const rp = resolveRp(c.env, c.req.header('Origin'));
  if (!rp) return apiError(c, 'VALIDATION', '許可されていないオリジンです');

  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null) as RegistrationResponseJSON | null;
  if (!body?.id || !body.response) return apiError(c, 'VALIDATION', 'リクエストが不正です');

  const clientData = (() => {
    try {
      const b64 = body.response.clientDataJSON.replace(/-/g, '+').replace(/_/g, '/');
      const pad = '='.repeat((4 - (b64.length % 4)) % 4);
      return JSON.parse(atob(b64 + pad)) as { challenge?: string };
    } catch { return null; }
  })();
  const challenge = clientData?.challenge;
  if (!challenge) return apiError(c, 'VALIDATION', 'チャレンジが不正です');

  const consumed = await consumeChallenge(c.env.DB, challenge, 'register');
  if (!consumed || consumed.userId !== userId) {
    return apiError(c, 'UNAUTHORIZED', 'チャレンジが無効か期限切れです');
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: false,
    });
  } catch {
    return apiError(c, 'VALIDATION', 'パスキーの検証に失敗しました');
  }
  if (!verification.verified || !verification.registrationInfo) {
    return apiError(c, 'VALIDATION', 'パスキーの検証に失敗しました');
  }

  const { credential } = verification.registrationInfo;
  const transports = body.response.transports ?? undefined;
  const db = c.env.DB;
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO auth_identities (user_id, provider, subject, public_key, counter, transports)
         VALUES (?1, 'passkey', ?2, ?3, ?4, ?5)`,
      ).bind(
        userId,
        credential.id,
        credential.publicKey,
        credential.counter,
        transports ? JSON.stringify(transports) : null,
      ),
      db.prepare('UPDATE users SET is_guest = 0 WHERE id = ?1').bind(userId),
    ]);
  } catch {
    return apiError(c, 'CONFLICT', 'このパスキーは既に登録されています');
  }

  return c.json({ ok: true, hasPasskey: true });
});

/* ---------- パスキー認証オプション(未ログイン可) ---------- */
authRoutes.post('/auth/passkey/login/options', async c => {
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  if (rateLimited(`passkeyopt:${ip}`, 20)) return apiError(c, 'RATE_LIMITED', 'しばらく待ってからお試しください');

  const rp = resolveRp(c.env, c.req.header('Origin'));
  if (!rp) return apiError(c, 'VALIDATION', '許可されていないオリジンです');

  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: 'preferred',
  });
  await saveChallenge(c.env.DB, options.challenge, 'authenticate', null);
  return c.json(options);
});

/* ---------- パスキーでログイン ---------- */
authRoutes.post('/auth/passkey/login', async c => {
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  if (rateLimited(`passkeylogin:${ip}`, 10)) return apiError(c, 'RATE_LIMITED', 'しばらく待ってからお試しください');

  const rp = resolveRp(c.env, c.req.header('Origin'));
  if (!rp) return apiError(c, 'VALIDATION', '許可されていないオリジンです');

  const body = await c.req.json().catch(() => null) as AuthenticationResponseJSON | null;
  if (!body?.id || !body.response) return apiError(c, 'VALIDATION', 'リクエストが不正です');

  const clientData = (() => {
    try {
      const b64 = body.response.clientDataJSON.replace(/-/g, '+').replace(/_/g, '/');
      const pad = '='.repeat((4 - (b64.length % 4)) % 4);
      return JSON.parse(atob(b64 + pad)) as { challenge?: string };
    } catch { return null; }
  })();
  const challenge = clientData?.challenge;
  if (!challenge) return apiError(c, 'VALIDATION', 'チャレンジが不正です');

  const consumed = await consumeChallenge(c.env.DB, challenge, 'authenticate');
  if (!consumed) return apiError(c, 'UNAUTHORIZED', 'チャレンジが無効か期限切れです');

  const passkey = await findPasskey(c.env.DB, body.id);
  if (!passkey) return apiError(c, 'UNAUTHORIZED', 'パスキーが見つかりません');

  const user = await c.env.DB
    .prepare('SELECT is_guest, status FROM users WHERE id = ?1')
    .bind(passkey.userId)
    .first<{ is_guest: number; status: string }>();
  if (!user) return apiError(c, 'UNAUTHORIZED', 'ユーザーが存在しません');
  if (user.status !== 'active') return apiError(c, 'BANNED', 'このアカウントは利用停止されています');

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: passkey.publicKey,
        counter: passkey.counter,
        transports: passkey.transports,
      },
      requireUserVerification: false,
    });
  } catch {
    return apiError(c, 'UNAUTHORIZED', 'パスキーの検証に失敗しました');
  }
  if (!verification.verified) return apiError(c, 'UNAUTHORIZED', 'パスキーの検証に失敗しました');

  await c.env.DB
    .prepare("UPDATE auth_identities SET counter = ?2 WHERE provider = 'passkey' AND subject = ?1")
    .bind(passkey.credentialId, verification.authenticationInfo.newCounter)
    .run();

  const tokens = await issueTokens(c.env, passkey.userId, !!user.is_guest);
  return c.json({ userId: passkey.userId, ...tokens });
});
