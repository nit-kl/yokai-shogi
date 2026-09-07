/* プレイヤー向けコピー。内部ID・APIパス・英語例外・空imgの文書URLを出さない */

import { YOKAI } from '../../shared/data';
import type { YokaiDef } from '../../shared/data';
import { ApiError, NetworkError, SessionExpiredError } from './meta/client';

export const NETWORK_ERROR_COPY =
  'サーバーに接続できません。通信状態を確認して、もう一度お試しください';

const HAS_JP = /[\u3040-\u30ff\u4e00-\u9fff]/;
const LOOKS_LIKE_URL = /https?:\/\/|wss?:\/\/|(^|[\s(])\/[A-Za-z0-9._~:/?#@!$&*+,;=%-]+|\.(webp|png|jpe?g|gif|svg|js|css|html)(\b|$)/i;
const LOOKS_LIKE_HTTP = /\b(GET|POST|PUT|PATCH|DELETE)\s+\//i;
const LOOKS_LIKE_CODE = /^[A-Z][A-Z0-9_]{2,}$/;

export function isPlayerFacingText(text: string): boolean {
  const msg = text.trim();
  if (msg.length < 2 || msg.length > 160) return false;
  if (LOOKS_LIKE_URL.test(msg) || LOOKS_LIKE_HTTP.test(msg)) return false;
  if (LOOKS_LIKE_CODE.test(msg)) return false;
  if (/^(error|Error|undefined|null|NaN)$/.test(msg)) return false;
  if (/[<>]/.test(msg)) return false;
  return HAS_JP.test(msg);
}

export function userErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof NetworkError) return NETWORK_ERROR_COPY;
  if (err instanceof SessionExpiredError) return err.message;
  if (err instanceof ApiError) {
    return isPlayerFacingText(err.message) ? err.message : fallback;
  }
  if (err instanceof Error && isPlayerFacingText(err.message)) return err.message;
  return fallback;
}

export function yokaiOf(id: string | null | undefined): YokaiDef | undefined {
  if (!id) return undefined;
  return YOKAI[id];
}

export function yokaiDisplayName(id: string | null | undefined, fallback = '妖怪'): string {
  return yokaiOf(id)?.name ?? fallback;
}

/** src 未設定の img が文書URLを壊れた画像として出さないよう、必ず名前を alt に載せる */
export function applyYokaiImage(
  img: HTMLImageElement,
  id: string | null | undefined,
  size: 'full' | 'sm' = 'full',
): boolean {
  const def = yokaiOf(id);
  if (!def) {
    img.removeAttribute('src');
    img.alt = '';
    return false;
  }
  img.alt = def.name;
  img.src = size === 'sm' ? def.imgSm : def.img;
  return true;
}
