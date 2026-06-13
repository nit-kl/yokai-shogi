/* 乱数・トークン・ハッシュ(CSPRNGのみ使用: doc 07) */

import { b64urlEncode } from './jwt';

/* CSPRNGの [0,1) 乱数(ガチャ抽選用。Math.randomは使わない) */
export function csprngRand(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

/* 不透明トークン(リフレッシュトークン用、既定256bit) */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64urlEncode(buf);
}

export async function sha256b64url(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return b64urlEncode(new Uint8Array(digest));
}

/* 引き継ぎコード: 紛らわしい文字(I/O/0/1)を除いた32文字×20桁 = 100bit
   表示形式: XXXX-XXXX-XXXX-XXXX-XXXX */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function genLinkCode(): string {
  const buf = new Uint8Array(20);
  crypto.getRandomValues(buf);
  let raw = '';
  for (const b of buf) raw += CODE_ALPHABET[b % 32];
  return raw.match(/.{4}/g)!.join('-');
}

/* 入力コードの正規化(小文字・区切り・空白の揺れを吸収) */
export function normalizeLinkCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-9]/g, '').match(/.{1,4}/g)?.join('-') ?? '';
}
