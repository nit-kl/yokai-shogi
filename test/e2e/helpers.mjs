/* e2e共通: オンライン版の初回同意を処理する */

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

export async function waitForTitle(page, timeout = 90000) {
  await page.waitForSelector('#screen-title.active', { timeout });
}
