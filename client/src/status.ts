/* API稼働状態の確認(メンテナンス表示用) */

declare const __API_URL__: string;

export interface ApiStatus { ok: boolean; maintenance: boolean }

export async function fetchApiStatus(): Promise<ApiStatus | null> {
  if (!__API_URL__) return null;
  try {
    const res = await fetch(`${__API_URL__}/healthz`, { cache: 'no-store' });
    const data = await res.json().catch(() => null) as ApiStatus | null;
    if (!res.ok || !data) return { ok: false, maintenance: false };
    return { ok: !!data.ok, maintenance: !!data.maintenance };
  } catch {
    return null;
  }
}
