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

/** リリース記念など起動時モーダルを閉じる */
export async function dismissStartupModals(page) {
  if (await page.locator('#modal-release-gift:not(.hidden)').count()) {
    await page.click('#btn-release-gift-ok');
    await page.waitForTimeout(300);
  }
  await dismissLegacyLoginModal(page);
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

export async function startSoloBattle(page) {
  await page.click('#btn-start');
  await page.waitForSelector('#screen-solo.active');
  await page.click('#btn-solo-battle');
  await page.waitForSelector('#screen-battle.active');
  await waitForBattleInput(page);
}
