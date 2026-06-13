/* Sentry(任意): VITE_SENTRY_DSN が設定されているときだけ初期化する */

declare const __SENTRY_DSN__: string;
declare const __RELEASE__: string;
declare const __API_URL__: string;

let ready = false;

export async function initSentry(): Promise<void> {
  const dsn = __SENTRY_DSN__;
  if (!dsn || ready) return;
  try {
    const Sentry = await import('@sentry/browser');
    Sentry.init({
      dsn,
      release: __RELEASE__,
      environment: __API_URL__ ? 'online' : 'offline',
      tracesSampleRate: 0,
      beforeSend(event) {
        if (event.request?.headers) delete event.request.headers.Authorization;
        return event;
      },
    });
    ready = true;
  } catch (err) {
    console.warn('[sentry] init skipped', err);
  }
}

export function captureException(err: unknown): void {
  if (!ready) return;
  void import('@sentry/browser').then(Sentry => Sentry.captureException(err));
}
