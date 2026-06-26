/* 広告流入改善用の軽量イベント計測 */

type LandingEventName =
  | 'app_loaded'
  | 'title_view'
  | 'solo_cta_click'
  | 'online_cta_click'
  | 'video_cta_click'
  | 'onboarding_start'
  | 'solo_battle_start'
  | 'online_battle_start'
  | 'result_view';

type EventPayload = {
  event: string;
  name: LandingEventName;
  at: string;
  path: string;
  referrer: string;
  params: Record<string, string>;
  details?: Record<string, string | number | boolean | null>;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: 'event', eventName: string, params?: Record<string, unknown>) => void;
  }
}

const STORAGE_KEY = 'yokaiShogi.landingEvents.v1';
const MAX_STORED_EVENTS = 80;
const onceKeys = new Set<string>();

function landingParams(): Record<string, string> {
  const params = new URLSearchParams(location.search);
  const picked = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'twclid', 'ref'];
  const out: Record<string, string> = {};
  for (const key of picked) {
    const value = params.get(key);
    if (value) out[key] = value;
  }
  return out;
}

function storeEvent(payload: EventPayload): void {
  try {
    const events = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as EventPayload[];
    events.push(payload);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_STORED_EVENTS)));
  } catch {
    /* 計測失敗でゲーム体験を止めない */
  }
}

export function trackLandingEvent(
  name: LandingEventName,
  details?: EventPayload['details'],
): void {
  const payload: EventPayload = {
    event: `yk_${name}`,
    name,
    at: new Date().toISOString(),
    path: `${location.pathname}${location.search}`,
    referrer: document.referrer,
    params: landingParams(),
    details,
  };

  storeEvent(payload);
  window.dispatchEvent(new CustomEvent('yokai-shogi:landing-event', { detail: payload }));
  window.dataLayer?.push(payload);
  window.gtag?.('event', name, {
    event_category: 'landing',
    ...payload.params,
    ...details,
  });
}

export function trackLandingEventOnce(
  key: string,
  name: LandingEventName,
  details?: EventPayload['details'],
): void {
  if (onceKeys.has(key)) return;
  onceKeys.add(key);
  trackLandingEvent(name, details);
}
