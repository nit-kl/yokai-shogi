/* ============================================================
   妖怪将棋 - ガチャ・編成・ログインボーナスUI
   ============================================================ */

import { COLS, ROWS, SETUP, YOKAI, TYPE_INFO, RARITY_INFO, formationWithBoss } from '../../shared/data';
import { $, showScreen } from './util';
import { AudioSys } from './audio';
import { FX } from './effects';
import { Meta } from './meta';
import type { GachaResult } from './meta';
import { Onboarding } from './onboarding';

export const MenuUI = {
  rows: null as unknown as (string | null)[][], // 編成画面の作業用コピー [前段, 最奥段]
  benchSel: null as string | null,              // 選択中の控え妖怪id
  _enterTitle: () => {},                        // main から注入(循環import回避)
  onboardingMode: null as 'gacha' | 'formation' | null,

  init(opts: { enterTitle: () => void }) {
    this._enterTitle = opts.enterTitle;
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
    $('btn-gacha-ok').onclick = () => {
      AudioSys.play('click');
      $('gacha-result').classList.add('hidden');
    };
    $('btn-form-back').onclick = () => { AudioSys.play('click'); void this.saveFormation(); };
    $('btn-form-reset').onclick = () => {
      AudioSys.play('click');
      if (this.onboardingMode === 'formation') {
        this.rows = formationWithBoss(Meta.bossId());
      } else {
        this.rows = SETUP.slice(ROWS - 2).map(r => [...r]);
      }
      this.benchSel = null;
      this.renderFormation();
    };
    this.initLinkCode();
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

  /* タイトル表示のたびに呼ばれる: 通貨表示+ログインボーナス演出
     (ボーナス判定は Meta.init() で済んでおり、結果は pendingLoginBonus にある) */
  onEnterTitle() {
    this.refreshCurrency();
    const bonus = Meta.pendingLoginBonus;
    Meta.pendingLoginBonus = null;
    if (bonus) {
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
    }
  },

  setOnboardingMode(mode: 'gacha' | 'formation' | null) {
    this.onboardingMode = mode;
    $('btn-gacha-back').classList.toggle('hidden', mode === 'gacha');
    $('btn-pull1').classList.toggle('hidden', mode === 'gacha');
    $('btn-form-reset').classList.toggle('hidden', mode === 'formation');
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
    /* データ引き継ぎはオンライン(サーバー権威)時のみ提供 */
    $('btn-link').classList.toggle('hidden', !d.online);
  },

  /* ============================== ガチャ ============================== */
  openGacha() {
    this.refreshCurrency();
    $('gacha-result').classList.add('hidden');
    showScreen('screen-gacha');
    FX.setAmbient(['rgba(200,120,255,0.5)', 'rgba(232,196,106,0.5)'], 0.06);
  },

  async doPull(count: 1 | 10) {
    /* 連打・二重送信を防ぐ */
    $<HTMLButtonElement>('btn-pull1').disabled = true;
    $<HTMLButtonElement>('btn-pull10').disabled = true;
    let results: GachaResult[] | null = null;
    try {
      results = await Meta.pull(count);
    } catch {
      results = null;
    }
    this.refreshCurrency();
    if (!results) return;
    AudioSys.play('cutin');
    this.showResults(results);
    if (this.onboardingMode === 'gacha' && count === 10) {
      $('btn-gacha-ok').onclick = () => {
        AudioSys.play('click');
        $('gacha-result').classList.add('hidden');
        Onboarding.onGachaDone();
      };
    }
  },

  showResults(results: GachaResult[]) {
    const wrap = $('gacha-cards');
    wrap.innerHTML = '';
    wrap.classList.toggle('many', results.length > 1);
    results.forEach((r, i) => {
      const def = YOKAI[r.id];
      const ri = RARITY_INFO[r.rarity];
      const card = document.createElement('div');
      card.className = `gacha-card ${ri.cls}`;
      card.style.animationDelay = `${i * 0.13}s`;
      card.innerHTML =
        `<div class="gc-rarity">${ri.label}</div>` +
        `<img src="${def.img}" alt="${def.name}" draggable="false">` +
        `<div class="gc-name">${def.name}</div>` +
        (r.isNew ? `<div class="gc-tag gc-new">NEW!</div>`
                 : `<div class="gc-tag gc-dupe">妖力 +${r.yoryoku}</div>`);
      wrap.appendChild(card);
    });
    $('gacha-result').classList.remove('hidden');

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
  openFormation() {
    this.rows = Meta.formationRows();
    this.benchSel = null;
    $('form-error').textContent = '';
    $('form-info').innerHTML = '配置する妖怪を選ぼう(大将は1体必須)';
    showScreen('screen-formation');
    FX.setAmbient(['rgba(88,182,255,0.45)', 'rgba(232,196,106,0.4)'], 0.04);
    this.renderFormation();
  },

  placedIds(): Set<string> {
    return new Set(this.rows.flat().filter((id): id is string => !!id));
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
      /* 配置済みをタップ → 盤から外す */
      for (const row of this.rows) {
        const i = row.indexOf(id);
        if (i >= 0) row[i] = null;
      }
      this.benchSel = null;
    } else {
      this.benchSel = (this.benchSel === id) ? null : id;
    }
    this.renderFormation();
  },

  onCellClick(ry: number, x: number) {
    const cur = this.rows[ry][x];
    if (this.benchSel) {
      /* 選択中の妖怪を配置(既存駒は控えに戻る) */
      this.rows[ry][x] = this.benchSel;
      this.benchSel = null;
      AudioSys.play('drop');
    } else if (cur) {
      this.showFormInfo(cur);
      this.rows[ry][x] = null; // タップで外す
      AudioSys.play('select');
    }
    this.renderFormation();
  },

  async saveFormation() {
    /* 即時にローカル検証してから保存(オフライン版・API版とも setFormation 内で再検証) */
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
    this._enterTitle();
  },
};
