/* リワード広告プロバイダ抽象(doc 22)
   UI は showRewardedAd() だけを呼ぶ。実広告 SDK の差はここに閉じ込める。 */

export type AdsProviderKind = 'mock' | 'gpt';

export interface AdsStatus {
  enabled: boolean;
  provider: AdsProviderKind;
  dailyCap: number;
  claimed: number;
  remaining: number;
  ticketsPerReward: number;
  clientConfig: { adUnitPath?: string };
}

export interface AdsClaimResult {
  granted: number;
  tickets: number;
  dailyCount: number;
  dailyCap: number;
  remaining: number;
}

export type RewardedAdOutcome =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'error'; message?: string };

export interface RewardedAdProvider {
  readonly kind: AdsProviderKind;
  /** 視聴完了で ok:true。ユーザーキャンセルや在庫切れは ok:false */
  show(config: AdsStatus['clientConfig']): Promise<RewardedAdOutcome>;
}

type GptNamespace = {
  cmd: Array<() => void> & { push(fn: () => void): void };
  defineOutOfPageSlot: (path: string, format: unknown) => { addService: (s: unknown) => unknown } | null;
  enums?: { OutOfPageFormat?: { REWARDED: unknown } };
  pubads: () => {
    enableSingleRequest: () => void;
    addEventListener: (event: string, handler: (e: unknown) => void) => void;
    removeEventListener: (event: string, handler: (e: unknown) => void) => void;
  };
  enableServices: () => void;
  display: (slot: unknown) => void;
  destroySlots: (slots?: unknown[]) => void;
};

function gpt(): GptNamespace | undefined {
  return (window as unknown as { googletag?: GptNamespace }).googletag;
}

function loadGptScript(): Promise<void> {
  if (gpt()?.cmd) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-yokai-gpt]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GPT script failed')));
      return;
    }
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
    s.dataset.yokaiGpt = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('GPT script failed'));
    document.head.appendChild(s);
  });
}

const mockProvider: RewardedAdProvider = {
  kind: 'mock',
  async show() {
    await new Promise<void>(r => setTimeout(r, 1500));
    return { ok: true };
  },
};

const gptProvider: RewardedAdProvider = {
  kind: 'gpt',
  async show(config) {
    const adUnitPath = config.adUnitPath?.trim();
    if (!adUnitPath) {
      return { ok: false, reason: 'unavailable', message: '広告ユニットが未設定です' };
    }
    try {
      await loadGptScript();
    } catch {
      return { ok: false, reason: 'unavailable', message: '広告の読み込みに失敗しました' };
    }

    const googletag = gpt();
    if (!googletag) {
      return { ok: false, reason: 'unavailable', message: '広告の読み込みに失敗しました' };
    }
    googletag.cmd = googletag.cmd || [];

    return new Promise<RewardedAdOutcome>(resolve => {
      let settled = false;
      const finish = (outcome: RewardedAdOutcome) => {
        if (settled) return;
        settled = true;
        resolve(outcome);
      };

      googletag.cmd.push(() => {
        const format = googletag.enums?.OutOfPageFormat?.REWARDED;
        if (format == null) {
          finish({ ok: false, reason: 'unavailable', message: 'この環境ではリワード広告を表示できません' });
          return;
        }
        const slot = googletag.defineOutOfPageSlot(adUnitPath, format);
        if (!slot) {
          finish({ ok: false, reason: 'unavailable', message: '広告枠を確保できませんでした' });
          return;
        }
        slot.addService(googletag.pubads());

        let granted = false;
        const onGranted = () => { granted = true; };
        const onClosed = () => {
          cleanup();
          finish(granted ? { ok: true } : { ok: false, reason: 'cancelled' });
        };
        const onReady = (event: unknown) => {
          const ev = event as { makeRewardedVisible?: () => void };
          ev.makeRewardedVisible?.();
        };
        const cleanup = () => {
          googletag.pubads().removeEventListener('rewardedSlotGranted', onGranted);
          googletag.pubads().removeEventListener('rewardedSlotClosed', onClosed);
          googletag.pubads().removeEventListener('rewardedSlotReady', onReady);
          try { googletag.destroySlots([slot]); } catch { /* ignore */ }
        };

        googletag.pubads().addEventListener('rewardedSlotGranted', onGranted);
        googletag.pubads().addEventListener('rewardedSlotClosed', onClosed);
        googletag.pubads().addEventListener('rewardedSlotReady', onReady);
        googletag.enableServices();
        googletag.display(slot);

        setTimeout(() => {
          if (!settled) {
            cleanup();
            finish({ ok: false, reason: 'unavailable', message: 'ただいま広告を配信できません' });
          }
        }, 20000);
      });
    });
  },
};

export function getRewardedProvider(kind: AdsProviderKind): RewardedAdProvider {
  return kind === 'gpt' ? gptProvider : mockProvider;
}

const CONSENT_KEY = 'yokaiShogi.ads.rewardConsent.v1';

export function hasAdRewardConsent(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
}

export function setAdRewardConsent(ok: boolean): void {
  try {
    if (ok) localStorage.setItem(CONSENT_KEY, '1');
    else localStorage.removeItem(CONSENT_KEY);
  } catch { /* ignore */ }
}

/** 初回のみ同意を取る。拒否なら false */
export function ensureAdRewardConsent(): boolean {
  if (hasAdRewardConsent()) return true;
  const ok = window.confirm(
    '広告を視聴すると、広告配信のため第三者(広告ネットワーク)へ端末・接続情報が送信される場合があります。\n\n'
    + 'プライバシーポリシーに同意のうえ視聴しますか？\n'
    + '（視聴は任意です。見なくてもゲームは遊べます）',
  );
  if (ok) setAdRewardConsent(true);
  return ok;
}
