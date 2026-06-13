/* Cloudflare Turnstile: 新規ゲスト作成時だけ明示レンダリングする。 */

interface TurnstileApi {
  render(container: string | HTMLElement, options: {
    sitekey: string;
    action: string;
    theme: 'dark';
    size: 'flexible';
    callback: (token: string) => void;
    'error-callback': () => void;
    'expired-callback': () => void;
  }): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('bot検証の読み込みに失敗しました'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export async function getTurnstileToken(siteKey: string): Promise<string> {
  const wrap = document.getElementById('turnstile-wrap');
  const container = document.getElementById('turnstile-widget');
  if (!wrap || !container) throw new Error('bot検証画面を表示できません');
  wrap.classList.remove('hidden');
  await loadScript();

  return new Promise((resolve, reject) => {
    let widgetId = '';
    const timer = setTimeout(() => finish(null, new Error('bot検証がタイムアウトしました')), 120_000);
    const finish = (token: string | null, error?: Error) => {
      clearTimeout(timer);
      if (widgetId) window.turnstile?.remove(widgetId);
      wrap.classList.add('hidden');
      container.innerHTML = '';
      if (token) resolve(token);
      else reject(error ?? new Error('bot検証に失敗しました'));
    };
    widgetId = window.turnstile!.render(container, {
      sitekey: siteKey,
      action: 'guest-account',
      theme: 'dark',
      size: 'flexible',
      callback: token => finish(token),
      'error-callback': () => finish(null),
      'expired-callback': () => finish(null, new Error('bot検証の有効期限が切れました')),
    });
  });
}

