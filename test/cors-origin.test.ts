import { expect, test } from 'vitest';
import { resolveCorsOrigin } from '../server/src/lib/cors-origin';

const allowed = [
  'https://yokai-shogi.nit-games.com',
  'http://tauri.localhost',
];

test('allowlist のオリジンを返す', () => {
  expect(resolveCorsOrigin('https://yokai-shogi.nit-games.com', allowed))
    .toBe('https://yokai-shogi.nit-games.com');
});

test('未知のサイトは拒否する', () => {
  expect(resolveCorsOrigin('https://evil.example.com', allowed)).toBeNull();
});

test('Tauri Windows の WebView origin を許可する', () => {
  expect(resolveCorsOrigin('https://tauri.localhost', allowed)).toBe('https://tauri.localhost');
  expect(resolveCorsOrigin('http://asset.localhost', allowed)).toBe('http://asset.localhost');
  expect(resolveCorsOrigin('tauri://localhost', allowed)).toBe('tauri://localhost');
  expect(resolveCorsOrigin('http://com.nitgames.yokai-shogi.localhost', allowed))
    .toBe('http://com.nitgames.yokai-shogi.localhost');
});

test('素の localhost は allowlist に無いと拒否する', () => {
  expect(resolveCorsOrigin('http://localhost:5173', allowed)).toBeNull();
});
