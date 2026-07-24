/* ============================================================
   妖怪将棋 - ガチャ・編成・ログインボーナスUI
   ============================================================ */

import { COLS, YOKAI, TYPE_INFO, RARITY_INFO } from '../../shared/data';
import { $, sleep, showScreen } from './util';
import { AudioSys } from './audio';
import { FX } from './effects';
import { Meta } from './meta';
import type { GachaResult } from './meta';
import { ensureAdRewardConsent, getRewardedProvider } from './ads/rewarded';
import type { AdsStatus } from './ads/rewarded';
import { Onboarding } from './onboarding';
import { SupportUI } from './support';
import { RegistrationStatsUI } from './registration-stats';

export const MenuUI = {
  rows: null as unknown as (string | null)[][], // 編成画面の作業用コピー [前段, 最奥段]
  benchSel: null as string | null,              // 選択中の控え妖怪id
  _enterTitle: () => {},                        // main から注入(循環import回避)
  _returnFromFormation: () => {},
  onboardingMode: null as 'gacha' | 'formation' | null,
  adsStatus: null as AdsStatus | null,

  init(opts: { enterTitle: () => void }) {
    this._enterTitle = opts.enterTitle;
    this._returnFromFormation = opts.enterTitle;
    $('btn-gacha').onclick = () => { AudioSys.play('click'); this.openGacha(); };
    $('btn-formation').onclick = () => { AudioSys.play('click'); this.openFormation(); };
    $('btn-gacha-back').onclick = () => { AudioSys.play('click'); this._enterTitle(); };
    $('btn-pull1').onclick = () => { void this.doPull(1); };
    $('btn-pull10').onclick = () => { void this.doPull(10); };
    $('btn-exchange').onclick = async () => {
      $<HTMLButtonElement>('btn-exchange').disabled = true;
      if (await Meta.exchange()) AudioSys.play('promote');
      this.refreshCurrency();
    };
    $('btn-ad-reward').onclick = () => { void this.watchAdReward(); };
    $('btn-gacha-ok').onclick = () => {
      AudioSys.play('click');
      $('gacha-result').classList.add('hidden');
    };
    $('btn-form-back').onclick = () => { AudioSys.play('click'); this.leaveFormation(); };
    $('btn-form-save').onclick = () => { AudioSys.play('click'); void this.saveFormation(); };
    this.initLinkCode();
    this.initProfile();
    this.initAudioSettings();
    SupportUI.init();
  },

  /* ============================== プロフィール ============================== */
  initProfile() {
    $('btn-profile').onclick = () => { AudioSys.play('click'); this.openProfile(); };
    $('btn-profile-close').onclick = () => { AudioSys.play('click'); $('modal-profile').classList.add('hidden'); };
    $('btn-profile-save').onclick = () => { void this.saveProfile(); };
    $<HTMLInputElement>('profile-name-input').onkeydown = ev => {
      if (ev.key === 'Enter') void this.saveProfile();
    };
  },

  /* ============================== 音量設定 ============================== */
  initAudioSettings() {
    const syncMuteBtn = () => {
      const icon = AudioSys.enabled ? '🔊' : '🔇';
      const muteBtn = document.getElementById('btn-mute');
      const titleBtn = document.getElementById('btn-audio');
      if (muteBtn) muteBtn.textContent = icon;
      if (titleBtn) titleBtn.textContent = icon;
    };
    const syncForm = () => {
      const bgm = Math.round(AudioSys.bgmVolume * 100);
      const se = Math.round(AudioSys.seVolume * 100);
      $<HTMLInputElement>('audio-mute').checked = !AudioSys.enabled;
      $<HTMLInputElement>('audio-bgm').value = String(bgm);
      $<HTMLInputElement>('audio-se').value = String(se);
      $('audio-bgm-val').textContent = String(bgm);
      $('audio-se-val').textContent = String(se);
      $<HTMLInputElement>('audio-bgm').disabled = !AudioSys.enabled;
      $<HTMLInputElement>('audio-se').disabled = !AudioSys.enabled;
      syncMuteBtn();
    };
    this._syncAudioUi = syncForm;
    $('btn-audio').onclick = () => { AudioSys.play('click'); this.openAudioSettings(); };
    $('btn-audio-close').onclick = () => { AudioSys.play('click'); $('modal-audio').classList.add('hidden'); };
    $<HTMLInputElement>('audio-mute').onchange = ev => {
      AudioSys.init();
      AudioSys.setEnabled(!(ev.target as HTMLInputElement).checked);
      syncForm();
    };
    $<HTMLInputElement>('audio-bgm').oninput = ev => {
      AudioSys.init();
      const v = Number((ev.target as HTMLInputElement).value);
      AudioSys.setBgmVolume(v / 100);
      $('audio-bgm-val').textContent = String(v);
    };
    $<HTMLInputElement>('audio-se').oninput = ev => {
      AudioSys.init();
      const v = Number((ev.target as HTMLInputElement).value);
      AudioSys.setSeVolume(v / 100);
      $('audio-se-val').textContent = String(v);
    };
    $<HTMLInputElement>('audio-se').onchange = () => {
      if (AudioSys.enabled && AudioSys.seVolume > 0) AudioSys.play('click');
    };
    syncForm();
  },

  _syncAudioUi() {},

  openAudioSettings() {
    AudioSys.init();
    this._syncAudioUi();
    $('modal-audio').classList.remove('hidden');
  },

  openProfile() {
    $<HTMLInputElement>('profile-name-input').value = Meta.data.name;
    $('profile-msg').textContent = '';
    $('modal-profile').classList.remove('hidden');
    setTimeout(() => $<HTMLInputElement>('profile-name-input').focus(), 0);
  },

  async saveProfile() {
    const button = $<HTMLButtonElement>('btn-profile-save');
    const name = $<HTMLInputElement>('profile-name-input').value;
    button.disabled = true;
    $('profile-msg').textContent = '';
    try {
      const err = await Meta.setName(name);
      if (err) {
        $('profile-msg').textContent = err;
        return;
      }
      AudioSys.play('promote');
      $('title-player-name').textContent = Meta.data.name;
      $('player-name').textContent = Meta.data.name;
      document.dispatchEvent(new CustomEvent('player-name-changed'));
      $('profile-msg').textContent = 'プレイヤーネームを変更しました';
      setTimeout(() => $('modal-profile').classList.add('hidden'), 650);
    } catch (e) {
      $('profile-msg').textContent = e instanceof Error ? e.message : '変更に失敗しました';
    } finally {
      button.disabled = false;
    }
  },

  /* ============================== データ引き継ぎ ============================== */
  initLinkCode() {
    $('btn-link').onclick = () => { AudioSys.play('click'); this.openLink(); };
    $('btn-link-close').onclick = () => { AudioSys.play('click'); $('modal-link').classList.add('hidden'); };
    $('btn-link-issue').onclick = async () => {
      const btn = $<HTMLButtonElement>('btn-link-issue');
      btn.disabled = true;
      $('link-msg').textContent = '';
      try {
        const code = await Meta.issueLinkCode();
        const disp = $('link-code-display');
        disp.textContent = code;
        disp.classList.remove('hidden');
        $('link-msg').textContent = 'コードを発行しました。メモして保管してください。';
      } catch (e) {
        $('link-msg').textContent = e instanceof Error ? e.message : 'コードの発行に失敗しました';
      } finally {
        btn.disabled = false;
      }
    };
    $('btn-link-redeem').onclick = async () => {
      const input = $<HTMLInputElement>('link-code-input');
      const code = input.value.trim();
      if (!code) { $('link-msg').textContent = 'コードを入力してください'; return; }
      const btn = $<HTMLButtonElement>('btn-link-redeem');
      btn.disabled = true;
      $('link-msg').textContent = '引き継ぎ中…';
      try {
        await Meta.redeemLinkCode(code);
        $('link-msg').textContent = '引き継ぎが完了しました。タイトルに戻ります。';
        input.value = '';
        $('link-code-display').classList.add('hidden');
        setTimeout(() => { $('modal-link').classList.add('hidden'); this._enterTitle(); }, 900);
      } catch (e) {
        $('link-msg').textContent = e instanceof Error ? e.message : '引き継ぎに失敗しました';
      } finally {
        btn.disabled = false;
      }
    };
  },

  openLink() {
    $('link-msg').textContent = '';
    $('link-code-display').classList.add('hidden');
    $<HTMLInputElement>('link-code-input').value = '';
    $('modal-link').classList.remove('hidden');
  },

  /* タイトル表示のたびに呼ばれる: 通貨表示+配布/ログインボーナス演出
     (判定は Meta.init() で済んでおり、結果は pending* にある) */
  onEnterTitle() {
    this.refreshCurrency();
    $('title-player-name').textContent = Meta.data.name;
    const gift = Meta.pendingReleaseGift;
    Meta.pendingReleaseGift = null;
    const bonus = Meta.pendingLoginBonus;
    Meta.pendingLoginBonus = null;

    const showLoginBonus = () => {
      if (!bonus) return;
      $('login-day').textContent = String(bonus.day);
      $('login-tickets').textContent = `×${bonus.tickets}`;
      $('login-next').textContent = (bonus.day % 7 === 0)
        ? '7日連続達成! また明日から集めよう'
        : `あと${7 - bonus.day % 7}日連続で 3枚 もらえる!`;
      $('modal-login').classList.remove('hidden');
      $('btn-login-ok').onclick = () => {
        AudioSys.play('promote');
        $('modal-login').classList.add('hidden');
        this.refreshCurrency();
      };
    };

    if (gift) {
      $('release-gift-tickets').textContent = `×${gift.tickets}`;
      $('modal-release-gift').classList.remove('hidden');
      $('btn-release-gift-ok').onclick = () => {
        AudioSys.play('promote');
        $('modal-release-gift').classList.add('hidden');
        this.refreshCurrency();
        showLoginBonus();
      };
      return;
    }
    showLoginBonus();
  },

  setOnboardingMode(mode: 'gacha' | 'formation' | null) {
    this.onboardingMode = mode;
    $('btn-gacha-back').classList.toggle('hidden', mode === 'gacha');
    $('btn-form-back').classList.toggle('hidden', mode === 'formation');
    $('btn-pull1').classList.toggle('hidden', mode === 'gacha');
    const hint = $('onboarding-hint');
    hint.classList.toggle('hidden', !mode);
    if (mode === 'gacha') {
      hint.textContent = '初回特典の10連召喚を引こう!';
      $('screen-gacha').querySelector('.menu-col')!.insertBefore(hint, $('screen-gacha').querySelector('.gacha-center'));
    } else if (mode === 'formation') {
      hint.textContent = '大将と仲間を配置して保存しよう';
      $('screen-formation').querySelector('.menu-col')!.insertBefore(hint, $('screen-formation').querySelector('.form-zone-label'));
    } else {
      $('app').appendChild(hint);
    }
  },

  refreshCurrency() {
    const d = Meta.data;
    for (const el of document.querySelectorAll('.cur-tickets')) el.textContent = `🎟 ×${d.tickets}`;
    for (const el of document.querySelectorAll('.cur-yoryoku')) el.textContent = `妖力 ${d.yoryoku}`;
    $<HTMLButtonElement>('btn-pull1').disabled = d.tickets < 1;
    $<HTMLButtonElement>('btn-pull10').disabled = d.tickets < 10;
    if (this.onboardingMode === 'gacha') {
      $<HTMLButtonElement>('btn-pull1').disabled = true;
      $<HTMLButtonElement>('btn-pull10').disabled = d.tickets < 10;
    }
    $<HTMLButtonElement>('btn-exchange').disabled = d.yoryoku < Meta.EXCHANGE_COST;
    this.refreshAdRewardButton();
    /* データ引き継ぎはオンライン(サーバー権威)時のみ提供 */
    $('btn-link').classList.toggle('hidden', !d.online);
  },

  refreshAdRewardButton() {
    const btn = $<HTMLButtonElement>('btn-ad-reward');
    const note = $('ad-reward-note');
    const st = this.adsStatus;
    const show = !!(st?.enabled && Meta.data.online && this.onboardingMode !== 'gacha');
    btn.classList.toggle('hidden', !show);
    note.classList.toggle('hidden', !show);
    if (!show || !st) return;
    const left = st.remaining;
    btn.disabled = left <= 0;
    btn.textContent = left > 0
      ? `広告を見てチケット+${st.ticketsPerReward}`
      : '本日の広告報酬は上限です';
    note.textContent = `残り ${left}/${st.dailyCap}回・任意視聴`;
  },

  async refreshAdsStatus() {
    if (!Meta.data.online) {
      this.adsStatus = null;
      this.refreshAdRewardButton();
      return;
    }
    this.adsStatus = await Meta.adsStatus();
    this.refreshAdRewardButton();
  },

  async watchAdReward() {
    const st = this.adsStatus;
    if (!st?.enabled || st.remaining <= 0) return;
    if (!ensureAdRewardConsent()) return;

    const btn = $<HTMLButtonElement>('btn-ad-reward');
    btn.disabled = true;
    const prevLabel = btn.textContent;
    btn.textContent = st.provider === 'mock' ? '視聴中…' : '広告を準備中…';
    AudioSys.play('click');

    try {
      const outcome = await getRewardedProvider(st.provider).show(st.clientConfig);
      if (!outcome.ok) {
        if (outcome.reason !== 'cancelled') {
          window.alert(outcome.message || '広告を表示できませんでした');
        }
        return;
      }
      const res = await Meta.claimAdReward(st.provider);
      if (res && res.granted > 0) {
        AudioSys.play('promote');
        this.adsStatus = st
          ? { ...st, claimed: res.dailyCount, remaining: res.remaining }
          : st;
      } else if (res) {
        this.adsStatus = { ...st, claimed: res.dailyCount, remaining: res.remaining };
      } else {
        window.alert('報酬の受け取りに失敗しました。しばらくしてから再度お試しください');
        await this.refreshAdsStatus();
      }
    } catch {
      window.alert('通信エラーのため報酬を受け取れませんでした');
      await this.refreshAdsStatus();
    } finally {
      this.refreshCurrency();
      if (btn.textContent === '視聴中…' || btn.textContent === '広告を準備中…') {
        btn.textContent = prevLabel || '広告を見てチケット+1';
      }
      this.refreshAdRewardButton();
    }
  },

  /* ============================== ガチャ ============================== */
  openGacha() {
    RegistrationStatsUI.stopPolling();
    this.refreshCurrency();
    void this.refreshAdsStatus();
    $('gacha-result').classList.add('hidden');
    showScreen('screen-gacha');
    FX.setAmbient(['rgba(200,120,255,0.5)', 'rgba(232,196,106,0.5)'], 0.06);
  },

  async doPull(count: 1 | 10) {
    /* 連打・二重送信を防ぐ */
    $<HTMLButtonElement>('btn-pull1').disabled = true;
    $<HTMLButtonElement>('btn-pull10').disabled = true;
    this.startSummon(count);
    let results: GachaResult[] | null = null;
    try {
      [results] = await Promise.all([Meta.pull(count), sleep(count === 10 ? 1450 : 1100)]);
    } catch {
      results = null;
    }
    this.refreshCurrency();
    if (!results) {
      $('gacha-summon').classList.add('hidden');
      return;
    }
    this.finishSummon(results);
    this.showResults(results);
    if (this.onboardingMode === 'gacha' && count === 10) {
      $('btn-gacha-ok').onclick = () => {
        AudioSys.play('click');
        $('gacha-result').classList.add('hidden');
        Onboarding.onGachaDone();
      };
    }
  },

  startSummon(count: 1 | 10) {
    const summon = $('gacha-summon');
    summon.className = count === 10 ? 'summon-ten' : 'summon-one';
    summon.querySelector('.summon-text')!.textContent = count === 10 ? '百鬼十連召喚' : '百鬼召喚';
    AudioSys.play('summon');
    const orb = document.querySelector('.gacha-orb') as HTMLElement;
    const r = orb.getBoundingClientRect();
    FX.ring(r.left + r.width / 2, r.top + r.height / 2, '#c88aff', 30, 110);
    FX.burst(r.left + r.width / 2, r.top + r.height / 2, ['#c88aff', '#ffd24a', '#6bd6ff'], 48, 5);
  },

  finishSummon(results: GachaResult[]) {
    const summon = $('gacha-summon');
    const specialDef = results.map(r => YOKAI[r.id]).find(def => def.variantOf);
    const hasSpecial = !!specialDef;
    const specialColors = specialDef?.summonColors ? [...specialDef.summonColors] : ['#fff8df', '#e32f3f', '#d9b75c'];
    const rarity = hasSpecial ? 'special'
      : results.some(r => r.rarity === 'SSR') ? 'ssr'
      : results.some(r => r.rarity === 'SR') ? 'sr'
      : results.some(r => r.rarity === 'R') ? 'r' : 'n';
    summon.classList.add(`finish-${rarity}`);
    const colors = rarity === 'special' ? specialColors
      : rarity === 'ssr' ? ['#ffd24a', '#fff6d8', '#ff9a3c']
      : rarity === 'sr' ? ['#c88aff', '#e8d0ff', '#6bd6ff']
      : ['#58b6ff', '#d8f0ff', '#9aa0b5'];
    FX.burst(innerWidth / 2, innerHeight / 2, colors, hasSpecial ? 150 : rarity === 'ssr' ? 100 : 64, hasSpecial ? 12 : rarity === 'ssr' ? 9 : 7);
    FX.ring(innerWidth / 2, innerHeight / 2, colors[0], 36, 160);
    if (hasSpecial) setTimeout(() => FX.ring(innerWidth / 2, innerHeight / 2, colors[1], 70, 260), 120);
    AudioSys.play(rarity === 'ssr' || hasSpecial ? 'win' : 'promote');
    setTimeout(() => summon.classList.add('hidden'), 420);
  },

  showResults(results: GachaResult[]) {
    const wrap = $('gacha-cards');
    wrap.innerHTML = '';
    wrap.classList.toggle('many', results.length > 1);
    const result = $('gacha-result');
    const special = results.find(r => YOKAI[r.id].variantOf);
    const specialColors = special && YOKAI[special.id].summonColors
      ? [...YOKAI[special.id].summonColors!] : ['#fff8df', '#e32f3f', '#d9b75c'];
    result.style.setProperty('--special-light', specialColors[0]);
    result.style.setProperty('--special-primary', specialColors[1]);
    result.style.setProperty('--special-accent', specialColors[2]);
    result.className = special ? 'result-special'
      : results.some(r => r.rarity === 'SSR') ? 'result-ssr'
      : results.some(r => r.rarity === 'SR') ? 'result-sr' : 'result-normal';
    $('gacha-result-title').textContent = special ? (YOKAI[special.id].summonTitle || '神妖 顕現')
      : results.some(r => r.rarity === 'SSR')
      ? '大妖怪 降臨' : results.some(r => r.rarity === 'SR') ? '希少妖怪 出現' : '召喚結果';
    results.forEach((r, i) => {
      const def = YOKAI[r.id];
      const ri = RARITY_INFO[r.rarity];
      const card = document.createElement('div');
      card.className = `gacha-card ${ri.cls}${def.variantOf ? ' gacha-card-special' : ''}`;
      if (def.summonColors) {
        card.style.setProperty('--special-light', def.summonColors[0]);
        card.style.setProperty('--special-primary', def.summonColors[1]);
        card.style.setProperty('--special-accent', def.summonColors[2]);
      }
      card.style.animationDelay = `${i * 0.13}s`;
      card.innerHTML =
        `<div class="gc-rarity">${ri.label}</div>` +
        `<img src="${def.img}" alt="${def.name}" draggable="false">` +
        `<div class="gc-name">${def.name}</div>` +
        (r.isNew ? `<div class="gc-tag gc-new">NEW!</div>`
                 : `<div class="gc-tag gc-dupe">妖力 +${r.yoryoku}</div>`);
      wrap.appendChild(card);
      setTimeout(() => {
        const rect = card.getBoundingClientRect();
        const colors = def.summonColors ? [...def.summonColors]
          : r.rarity === 'SSR' ? ['#ffd24a', '#fff6d8', '#ff9a3c']
          : r.rarity === 'SR' ? ['#c88aff', '#e8d0ff'] : ['#58b6ff', '#9aa0b5'];
        FX.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, colors, def.variantOf ? 64 : r.rarity === 'SSR' ? 34 : 14, def.variantOf ? 5 : 3.5);
      }, i * 130 + 180);
    });
    result.classList.remove('hidden');

    /* SSRはお祭り */
    if (results.some(r => r.rarity === 'SSR')) {
      setTimeout(() => {
        AudioSys.play('win');
        FX.confetti();
        setTimeout(() => FX.confetti(), 500);
      }, results.length * 130 + 350);
    }
  },

  /* ============================== 編成 ============================== */
  openFormation(opts?: { onReturn?: () => void }) {
    this._returnFromFormation = opts?.onReturn ?? this._enterTitle;
    RegistrationStatsUI.stopPolling();
    this.rows = Meta.formationRows();
    this.benchSel = null;
    $('form-error').textContent = '';
    $('form-info').innerHTML = '配置する妖怪を選ぼう(大将は1体必須)';
    this.ensureBossPlaced();
    showScreen('screen-formation');
    FX.setAmbient(['rgba(88,182,255,0.45)', 'rgba(232,196,106,0.4)'], 0.04);
    this.renderFormation();
  },

  leaveFormation() {
    if (Onboarding.active) return;
    const ret = this._returnFromFormation;
    this._returnFromFormation = this._enterTitle;
    ret();
  },

  placedIds(): Set<string> {
    return new Set(this.rows.flat().filter((id): id is string => !!id));
  },

  bossIds(): string[] {
    return this.rows.flat().filter((id): id is string => !!id && YOKAI[id].type === 'boss');
  },

  firstOwnedBoss(): string | null {
    return Meta.ownedList().find(id => YOKAI[id].type === 'boss') || null;
  },

  ensureBossPlaced() {
    if (this.bossIds().length > 0) return;
    const boss = this.firstOwnedBoss();
    if (!boss) return;
    this.rows[1][Math.floor(COLS / 2)] = boss;
  },

  removePlaced(id: string) {
    for (const row of this.rows) {
      const i = row.indexOf(id);
      if (i >= 0) row[i] = null;
    }
  },

  updateFormationStatus() {
    const err = Meta.validateFormation(this.rows);
    $('form-error').textContent = err ? `⚠ ${err}` : '';
    $<HTMLButtonElement>('btn-form-save').disabled = !!err;
  },

  renderFormation() {
    /* --- 盤(自軍2段) --- */
    const grid = $('form-grid');
    grid.innerHTML = '';
    for (let ry = 0; ry < 2; ry++) {
      for (let x = 0; x < COLS; x++) {
        const id = this.rows[ry][x];
        const cell = document.createElement('div');
        cell.className = 'form-cell';
        if (id) {
          const def = YOKAI[id];
          cell.classList.add(RARITY_INFO[def.rarity].cls);
          if (def.type === 'boss') cell.classList.add('form-boss');
          cell.innerHTML = `<img src="${def.imgSm}" alt="${def.name}" draggable="false">`;
        }
        cell.onclick = () => this.onCellClick(ry, x);
        grid.appendChild(cell);
      }
    }

    /* --- 控え(所持妖怪) --- */
    const bench = $('form-bench');
    bench.innerHTML = '';
    const placed = this.placedIds();
    for (const id of Meta.ownedList()) {
      const def = YOKAI[id];
      const chip = document.createElement('div');
      chip.className = `bench-chip ${RARITY_INFO[def.rarity].cls}`;
      if (placed.has(id)) chip.classList.add('in-form');
      if (this.benchSel === id) chip.classList.add('chip-selected');
      chip.innerHTML =
        `<img src="${def.imgSm}" alt="${def.name}" draggable="false">` +
        `<span class="bench-r">${def.rarity}</span>`;
      chip.onclick = () => this.onBenchClick(id);
      bench.appendChild(chip);
    }
    this.updateFormationStatus();
  },

  showFormInfo(id: string) {
    const def = YOKAI[id];
    const ti = TYPE_INFO[def.type];
    $('form-info').innerHTML =
      `<span class="type-chip ${ti.cls}">${ti.label}</span> ` +
      `<b>${def.name}</b> <span class="fi-atk">ATK ${def.atk}</span><br>` +
      `${def.moveText}<br>【${def.skill.name}】${def.skill.desc}`;
  },

  onBenchClick(id: string) {
    AudioSys.play('select');
    this.showFormInfo(id);
    if (this.placedIds().has(id)) {
      if (YOKAI[id].type === 'boss') {
        /* 大将は必須なので、控えタップでは外さず「移動対象」として扱う */
        this.benchSel = (this.benchSel === id) ? null : id;
      } else {
        /* 配置済みをタップ → 盤から外す */
        this.removePlaced(id);
        this.benchSel = null;
      }
    } else {
      this.benchSel = (this.benchSel === id) ? null : id;
    }
    this.renderFormation();
  },

  onCellClick(ry: number, x: number) {
    const cur = this.rows[ry][x];
    if (this.benchSel) {
      const selected = this.benchSel;
      const selectedIsBoss = YOKAI[selected].type === 'boss';
      const replacingOnlyBoss = cur && YOKAI[cur].type === 'boss' && this.bossIds().length <= 1 && !selectedIsBoss;
      if (replacingOnlyBoss) {
        $('form-error').textContent = '⚠ 大将は必須です。大将以外は別のマスに配置してください';
        return;
      }
      /* 選択中の妖怪を配置(既存駒は控えに戻る) */
      if (selectedIsBoss) {
        for (const bossId of this.bossIds()) this.removePlaced(bossId);
      } else {
        this.removePlaced(selected);
      }
      this.rows[ry][x] = selected;
      this.benchSel = null;
      AudioSys.play('drop');
    } else if (cur) {
      this.showFormInfo(cur);
      if (YOKAI[cur].type === 'boss') {
        /* うっかり大将を外して詰まらないよう、盤上タップでは移動選択にする */
        this.benchSel = cur;
      } else {
        this.rows[ry][x] = null; // タップで外す
      }
      AudioSys.play('select');
    }
    this.renderFormation();
  },

  async saveFormation() {
    /* 即時にローカル検証してから保存(オフライン版・API版とも setFormation 内で再検証) */
    this.ensureBossPlaced();
    const localErr = Meta.validateFormation(this.rows);
    if (localErr) { $('form-error').textContent = `⚠ ${localErr}`; return; }
    let err: string | null = null;
    try {
      err = await Meta.setFormation(this.rows);
    } catch {
      err = '保存に失敗しました。通信状態を確認してください';
    }
    if (err) { $('form-error').textContent = `⚠ ${err}`; return; }
    if (Onboarding.active) {
      await Onboarding.onFormationSaved();
      return;
    }
    const ret = this._returnFromFormation;
    this._returnFromFormation = this._enterTitle;
    ret();
  },
};
