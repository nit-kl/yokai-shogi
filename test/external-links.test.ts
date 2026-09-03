import { expect, test, vi } from 'vitest';
import { resolvePublicUrl, SITE_ORIGIN } from '../client/src/external-links';

test('ブラウザでは相対パスのまま', () => {
  expect(resolvePublicUrl('/legal/terms.html')).toBe('/legal/terms.html');
  expect(resolvePublicUrl('https://example.com/a')).toBe('https://example.com/a');
});

test('Tauri では公開サイトの絶対 URL にする', async () => {
  vi.resetModules();
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke: vi.fn() });
  const { resolvePublicUrl: resolve, SITE_ORIGIN: origin } = await import('../client/src/external-links');
  expect(resolve('/legal/privacy.html')).toBe(`${origin}/legal/privacy.html`);
  vi.unstubAllGlobals();
});
