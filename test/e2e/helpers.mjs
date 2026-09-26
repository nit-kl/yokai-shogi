/* e2e共通: オンライン版の初回同意を処理する */

/** AdSense 等の第三者スクリプト由来で、アプリ不具合ではない console / pageerror ノイズ */
const IGNORE_THIRD_PARTY_RE = /Content Security Policy|frame-ancestors|googlesyndication|doubleclick\.net|adsbygoogle|pagead2|googleads|googletagmanager|google-analytics|googletagservices/i;

/** adsbygoogle / protobufjs が headless Chromium で投げる型エラー。アプリコードに int64 はない */
const IGNORE_PAGEERROR_RE = /^(int64|uint64|int32|uint32)$/i;

const THIRD_PARTY_AD_URL = /googlesyndication|doubleclick\.net|googleads|pagead2|adsbygoogle|googletagmanager|google-analytics|googletagservices/i;

/**
 * pageerror と自前由来の console.error を errors に溜める。
 * 第三者広告・計測は空レスポンスで差し替え(abort すると net::ERR_FAILED が console に出る)。
 * CSP report-only や protobuf の int64 例外は無視する。
 */
export function attachPageErrorCollectors(page, errors) {
  void page.route(THIRD_PARTY_AD_URL, async route => {
    const type = route.request().resourceType();
    if (type === 'script') {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
  page.on('pageerror', e => {
    const msg = e.message || String(e);
    const stack = e.stack || '';
    if (IGNORE_THIRD_PARTY_RE.test(msg) || IGNORE_THIRD_PARTY_RE.test(stack) || IGNORE_PAGEERROR_RE.test(msg.trim())) {
      return;
    }
    errors.push('pageerror: ' + msg);
  });
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text();
    const url = m.location()?.url || '';
    if (IGNORE_THIRD_PARTY_RE.test(text) || IGNORE_THIRD_PARTY_RE.test(url)) return;
    /* route 差し替え前の読み込み失敗や、URLなしの第三者ネットエラー */
    if (/Failed to load resource: net::ERR_(FAILED|ABORTED|BLOCKED_BY_CLIENT)/i.test(text)) return;
    errors.push('console: ' + text);
  });
}

/** 同意モーダルが出ていれば「オンライン利用」で進める */
export async function acceptConsentIfNeeded(page) {
  const consent = page.locator('#modal-consent:not(.hidden)');
  try {
    await consent.waitFor({ state: 'visible', timeout: 60000 });
    await page.click('#btn-consent-accept');
    await waitForTitle(page);
  } catch {
    /* 同意済み・オフライン版・モーダルなし */
  }
}

/** 同意モーダル: ソロ動作確認用（Turnstile不要） */
export async function acceptConsentForSolo(page) {
  const consent = page.locator('#modal-consent:not(.hidden)');
  try {
    await consent.waitFor({ state: 'visible', timeout: 60000 });
    await page.click('#btn-consent-local');
    await waitForTitle(page);
  } catch {
    await waitForTitle(page);
  }
}

/** 旧ログインボーナスモーダル(互換) */
export async function dismissLegacyLoginModal(page) {
  if (await page.locator('#modal-login:not(.hidden)').count()) {
    await page.click('#btn-login-ok');
    await page.waitForTimeout(300);
  }
}

/** リリース記念など起動時モーダルを閉じる */
export async function dismissStartupModals(page) {
  if (await page.locator('#modal-release-gift:not(.hidden)').count()) {
    await page.click('#btn-release-gift-ok');
    await page.waitForTimeout(300);
  }
  await dismissLegacyLoginModal(page);
  if (await page.locator('#modal-link-nudge:not(.hidden)').count()) {
    await page.click('#btn-nudge-later');
    await page.waitForTimeout(200);
  }
}

/** 対局の入力ロック(開幕VS・共鳴カットイン等)が解除されるまで待つ */
export async function waitForBattleInput(page, timeout = 15000) {
  await page.waitForSelector('#vs-intro.hidden', { state: 'attached', timeout });
  await page.waitForSelector('#cutin.hidden', { state: 'attached', timeout });
  await page.waitForFunction(() => window.yk && !window.yk.busy && window.yk.G?.turn === 'p', { timeout });
}

export async function waitForTitle(page, timeout = 90000) {
  await page.waitForSelector('#screen-title.active', { timeout });
}

/** 既存e2e用: オンボーディング済みの旧セーブ状態にする */
export async function skipOnboarding(page) {
  await page.evaluate(() => {
    const { Meta, SETUP } = window.yk;
    Meta.data.onboardingDone = true;
    Meta.data.owned = {};
    for (const row of SETUP.slice(-2)) for (const id of row) if (id) Meta.data.owned[id] = 1;
    Meta.data.formation = SETUP.slice(-2).map(r => [...r]);
    Meta.data.tickets = 11;
    Meta.save();
  });
  await page.reload();
  await waitForTitle(page);
  await dismissStartupModals(page);
}

/** 百鬼夜行: ロビー → プレビュー → 開戦 */
export async function startSoloBattle(page) {
  await page.click('#btn-start');
  await page.waitForSelector('#screen-solo.active');
  await page.click('#btn-solo-battle');
  await page.waitForSelector('#screen-hyakki-preview.active');
  await page.click('#btn-hyakki-fight');
  await page.waitForSelector('#screen-battle.active');
  await waitForBattleInput(page);
}
