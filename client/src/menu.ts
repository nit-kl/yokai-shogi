/* ============================================================
   妖怪将棋 - ガチャ・編成・ログインボーナスUI
   ============================================================ */

import { COLS, ROWS, SETUP, YOKAI, TYPE_INFO, RARITY_INFO } from '../../shared/data';
import { $, showScreen } from './util';
import { AudioSys } from './audio';
import { FX } from './effects';
import { Meta } from './meta';
import type { GachaResult } from './meta';

export const MenuUI = {
  rows: null as unknown as (string | null)[][], // 編成画面の作業用コピー [前段, 最奥段]
  benchSel: null as string | null,              // 選択中の控え妖怪id
  _enterTitle: () => {},                        // main から注入(循環import回避)

  init(opts: { enterTitle: () => void }) {
    this._enterTitle = opts.enterTitle;
    $('btn-gacha').onclick = () => { AudioSys.play('click'); this.openGacha(); };
    $('btn-formation').onclick = () => { AudioSys.play('click'); this.openFormation(); };
    $('btn-gacha-back').onclick = () => { AudioSys.play('click'); this._enterTitle(); };
    $('btn-pull1').onclick = () => this.doPull(1);
    $('btn-pull10').onclick = () => this.doPull(10);
    $('btn-exchange').onclick = () => {
      if (Meta.exchange()) { AudioSys.play('promote'); this.refreshCurrency(); }
    };
    $('btn-gacha-ok').onclick = () => {
      AudioSys.play('click');
      $('gacha-result').classList.add('hidden');
    };
    $('btn-form-back').onclick = () => { AudioSys.play('click'); this.saveFormation(); };
    $('btn-form-reset').onclick = () => {
      AudioSys.play('click');
      this.rows = SETUP.slice(ROWS - 2).map(r => [...r]);
      this.benchSel = null;
      this.renderFormation();
    };
  },

  /* タイトル表示のたびに呼ばれる: ログインボーナス判定+通貨表示 */
  onEnterTitle() {
    this.refreshCurrency();
    const bonus = Meta.claimLoginBonus();
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

  refreshCurrency() {
    const d = Meta.data;
    for (const el of document.querySelectorAll('.cur-tickets')) el.textContent = `🎟 ×${d.tickets}`;
    for (const el of document.querySelectorAll('.cur-yoryoku')) el.textContent = `妖力 ${d.yoryoku}`;
    $<HTMLButtonElement>('btn-pull1').disabled = d.tickets < 1;
    $<HTMLButtonElement>('btn-pull10').disabled = d.tickets < 10;
    $<HTMLButtonElement>('btn-exchange').disabled = d.yoryoku < Meta.EXCHANGE_COST;
  },

  /* ============================== ガチャ ============================== */
  openGacha() {
    this.refreshCurrency();
    $('gacha-result').classList.add('hidden');
    showScreen('screen-gacha');
    FX.setAmbient(['rgba(200,120,255,0.5)', 'rgba(232,196,106,0.5)'], 0.06);
  },

  doPull(count: number) {
    const results = Meta.pull(count);
    if (!results) return;
    AudioSys.play('cutin');
    this.refreshCurrency();
    this.showResults(results);
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

  saveFormation() {
    const err = Meta.setFormation(this.rows);
    if (err) {
      $('form-error').textContent = `⚠ ${err}`;
      return;
    }
    this._enterTitle();
  },
};
