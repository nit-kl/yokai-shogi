/* ビルドターゲット(Web / Steam)。vite.config.ts の __PLATFORM__ で注入 */

export type AppPlatform = 'web' | 'steam';

declare const __PLATFORM__: AppPlatform;

export function getPlatform(): AppPlatform {
  return __PLATFORM__;
}

export function isSteam(): boolean {
  return __PLATFORM__ === 'steam';
}

/** Tauri WebView 内か。ブラウザの Steam モード開発では false。 */
export function isTauriRuntime(): boolean {
  return typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;
}

/** Steam ビルドではリワード広告・AdSense 経路を一切使わない(doc 23) */
export function adsAllowed(): boolean {
  return __PLATFORM__ === 'web';
}
