/* Tauri WebView は target=_blank の新規ウィンドウを開かない。
   Steam 版では公開サイトを OS のブラウザで開く。 */

import { isTauriRuntime } from './platform';

export const SITE_ORIGIN = 'https://yokai-shogi.nit-games.com';

export function resolvePublicUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return isTauriRuntime() ? `${SITE_ORIGIN}${path}` : path;
}

function isExternalHttpUrl(href: string): boolean {
  try {
    const url = new URL(href, location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.origin !== location.origin;
  } catch {
    return false;
  }
}

function shouldOpenInOsBrowser(anchor: HTMLAnchorElement): boolean {
  if (!isTauriRuntime()) return false;
  if (anchor.target === '_blank') return true;
  return isExternalHttpUrl(anchor.href);
}

async function openInOsBrowser(href: string): Promise<void> {
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(href);
}

export function wireExternalLinks(): void {
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest?.('a[href]');
    if (!(anchor instanceof HTMLAnchorElement) || !shouldOpenInOsBrowser(anchor)) return;
    event.preventDefault();
    void openInOsBrowser(anchor.href).catch(err => {
      console.warn('[links] failed to open in OS browser', err);
      const path = new URL(anchor.href, location.href).pathname;
      if (path.startsWith('/legal/')) location.assign(path);
    });
  });
}
