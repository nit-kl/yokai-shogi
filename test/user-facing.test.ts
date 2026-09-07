import { expect, test } from 'vitest';
import { ApiError, NetworkError } from '../client/src/meta/client';
import {
  applyYokaiImage,
  isPlayerFacingText,
  userErrorMessage,
  yokaiDisplayName,
} from '../client/src/user-facing';

test('内部パス・URL・エラーコードはプレイヤー向けとみなさない', () => {
  expect(isPlayerFacingText('POST /v1/solo/win failed')).toBe(false);
  expect(isPlayerFacingText('GET /v1/me failed')).toBe(false);
  expect(isPlayerFacingText('https://api.yokai-shogi.nit-games.com/v1/me')).toBe(false);
  expect(isPlayerFacingText('assets/pieces/kyubi.webp')).toBe(false);
  expect(isPlayerFacingText('INTERNAL')).toBe(false);
  expect(isPlayerFacingText('error')).toBe(false);
  expect(isPlayerFacingText('nurarihyon_hyakki')).toBe(false);
  expect(isPlayerFacingText('チケットが不足しています')).toBe(true);
});

test('例外メッセージは日本語のAPI文言だけ通し、それ以外はフォールバック', () => {
  const fallback = 'もう一度お試しください';
  expect(userErrorMessage(new NetworkError('POST /v1/me failed'), fallback))
    .toBe('サーバーに接続できません。通信状態を確認して、もう一度お試しください');
  expect(userErrorMessage(new ApiError('INTERNAL', 'error', 500), fallback)).toBe(fallback);
  expect(userErrorMessage(new ApiError('VALIDATION', 'チケットが不足しています', 400), fallback))
    .toBe('チケットが不足しています');
  expect(userErrorMessage(new Error('online connection unavailable'), fallback)).toBe(fallback);
  expect(userErrorMessage(new Error('Failed to fetch'), fallback)).toBe(fallback);
});

test('未知の妖怪IDは内部キーではなく表示名フォールバック', () => {
  expect(yokaiDisplayName('kyubi')).toBe('九尾の狐');
  expect(yokaiDisplayName('not_a_real_yokai')).toBe('妖怪');
  expect(yokaiDisplayName(null)).toBe('妖怪');
});

test('未知の妖怪画像は src を付けず文書URLを出さない', () => {
  class FakeImg {
    alt = '';
    private srcAttr: string | undefined = '';
    removeAttribute(name: string) { if (name === 'src') this.srcAttr = undefined; }
    hasAttribute(name: string) { return name === 'src' && this.srcAttr !== undefined; }
    getAttribute(name: string) { return name === 'src' ? this.srcAttr ?? null : null; }
    set src(value: string) { this.srcAttr = value; }
    get src() { return this.srcAttr ?? ''; }
  }
  const img = new FakeImg() as unknown as HTMLImageElement;
  expect(applyYokaiImage(img, 'missing_id')).toBe(false);
  expect(img.hasAttribute('src')).toBe(false);
  expect(img.alt).toBe('');
  expect(applyYokaiImage(img, 'kyubi')).toBe(true);
  expect(img.alt).toBe('九尾の狐');
  expect(img.getAttribute('src')).toContain('kyubi');
});
