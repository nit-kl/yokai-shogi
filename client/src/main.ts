/* ============================================================
   妖怪将棋 - メインUIコントローラ
   ============================================================ */

import {
  COLS, ROWS, MAX_HP, ZONE_DEPTH, YOKAI, TYPE_INFO, RARITY_INFO,
  ALL_IMAGES, ENEMY_BOSS, GACHA_POOL, SETUP,
} from '../../shared/data';
import type { Side } from '../../shared/data';
import { Game } from '../../shared/game';
import type { Action, GameEvent, GameState, MoveTarget, Pos, CaptureEvent } from '../../shared/game';
import { AI } from './ai';
import { Meta } from './meta';
import { MenuUI } from './menu';
import { FX } from './effects';
import { AudioSys } from './audio';
import { $, sleep, showScreen } from './util';

let G: GameState | null = null; // ゲーム状態
let busy = false;               // 演出中・AI思考中の入力ロック
type Sel = { kind: 'piece'; x: number; y: number; moves: MoveTarget[] } | { kind: 'hand'; id: string; drops: Pos[] } | null;
let sel: Sel = null;            // 選択中
const pieceEls = new Map<number, HTMLElement>(); // uid -> DOM要素

const COLORS_P = ['#ffd24a', '#ff9a3c', '#fff6d8', '#ffe9a0'];
const COLORS_E = ['#ff5d5d', '#c84aff', '#ffd0d0', '#ff9a8a'];

/* ============================== 起動 ============================== */
window.addEventListener('DOMContentLoaded', () => {
  FX.init();
  buildBoardCells();
  buildRulesPieces();
  wireButtons();
  MenuUI.init({ enterTitle });
  void boot();
  // 初回操作でオーディオ起動
  const audioKick = () => { AudioSys.init(); AudioSys.resume(); };
  addEventListener('pointerdown', audioKick, { once: true });
});

/* 画像プリロードとメタ初期化(認証・ログボ判定)を待ってからタイトルへ */
async function boot() {
  await Promise.all([
    preloadImages(),
    Meta.init().catch(err => { console.error('[meta] init failed', err); return null; }),
  ]);
  enterTitle();
}

/* ---------- 画像プリロード ---------- */
function preloadImages(): Promise<void> {
  return new Promise(resolve => {
    let done = 0;
    const total = ALL_IMAGES.length;
    const update = () => {
      const pct = Math.round(done / total * 100);
      $('loading-fill').style.width = pct + '%';
      $('loading-pct').textContent = pct + '%';
      if (done >= total) setTimeout(resolve, 450);
    };
    ALL_IMAGES.forEach(src => {
      const img = new Image();
      img.onload = img.onerror = () => { done++; update(); };
      img.src = src;
    });
    update();
  });
}

function enterTitle() {
  const boss = YOKAI[Meta.bossId()];
  $<HTMLImageElement>('title-boss-l').src = boss.img;
  $<HTMLImageElement>('title-boss-r').src = YOKAI[ENEMY_BOSS].img;
  $('title-vs-p').textContent = boss.name;
  showScreen('screen-title');
  FX.setAmbient(['rgba(130,160,255,0.55)', 'rgba(200,120,255,0.5)', 'rgba(232,196,106,0.45)'], 0.05);
  MenuUI.onEnterTitle();
}

/* ---------- ボタン類 ---------- */
function wireButtons() {
  $('btn-start').onclick = () => { AudioSys.init(); AudioSys.play('click'); startBattle(); };
  $('btn-rules').onclick = () => { AudioSys.play('click'); $('modal-rules').classList.remove('hidden'); };
  $('btn-rules2').onclick = () => { AudioSys.play('click'); $('modal-rules').classList.remove('hidden'); };
  $('btn-close-rules').onclick = () => { AudioSys.play('click'); $('modal-rules').classList.add('hidden'); };
  $('btn-mute').onclick = () => {
    AudioSys.init();
    $('btn-mute').textContent = AudioSys.toggle() ? '🔊' : '🔇';
  };
  $('btn-resign').onclick = () => {
    if (!G || G.winner || busy) return;
    if (confirm('投了しますか?')) {
      G.winner = 'e'; G.reason = 'resign';
      showResult();
    }
  };
  $('btn-retry').onclick = () => { AudioSys.play('click'); startBattle(); };
  $('btn-title').onclick = () => {
    AudioSys.play('click');
    AudioSys.stopBgm();
    enterTitle();
  };
}

/* ============================== 盤の構築 ============================== */
function buildBoardCells() {
  const wrap = $('board-cells');
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = document.createElement('div');
      c.className = 'cell' + (y < ZONE_DEPTH ? ' zone-enemy' : y >= ROWS - ZONE_DEPTH ? ' zone-player' : '');
      c.dataset.x = String(x); c.dataset.y = String(y);
      c.appendChild(Object.assign(document.createElement('div'), { className: 'hl' }));
      c.addEventListener('click', () => onCellClick(x, y));
      wrap.appendChild(c);
    }
  }
}

function cellEl(x: number, y: number): HTMLElement {
  return $('board-cells').children[y * COLS + x] as HTMLElement;
}

/* セル中心のビューポート座標(エフェクト用) */
function cellCenter(x: number, y: number) {
  const r = $('board-pieces').getBoundingClientRect();
  return {
    x: r.left + (x + 0.5) * r.width / COLS,
    y: r.top + (y + 0.5) * r.height / ROWS,
  };
}

function positionPiece(el: HTMLElement, x: number, y: number) {
  el.style.left = (x * 100 / COLS) + '%';
  el.style.top = (y * 100 / ROWS) + '%';
  el.style.width = (100 / COLS) + '%';
  el.style.height = (100 / ROWS) + '%';
}

function makePieceEl(pc: { uid: number; id: string; owner: Side }): HTMLElement {
  const el = document.createElement('div');
  el.className = `piece owner-${pc.owner}` + (YOKAI[pc.id].type === 'boss' ? ' boss-piece' : '');
  el.dataset.uid = String(pc.uid);
  el.innerHTML = `<div class="piece-base"></div><img src="${YOKAI[pc.id].img}" alt="${YOKAI[pc.id].name}" draggable="false">`;
  $('board-pieces').appendChild(el);
  pieceEls.set(pc.uid, el);
  return el;
}

function setPromoted(el: HTMLElement) {
  if (el.classList.contains('promoted')) return;
  el.classList.add('promoted');
  const b = document.createElement('div');
  b.className = 'promo-badge';
  b.textContent = '成';
  el.appendChild(b);
}

/* 状態とDOMを同期 */
function renderAll() {
  const seen = new Set<number>();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const pc = G!.board[y][x];
      if (!pc) continue;
      seen.add(pc.uid);
      const el = pieceEls.get(pc.uid) || makePieceEl(pc);
      positionPiece(el, x, y);
      if (pc.promoted) setPromoted(el);
    }
  }
  for (const [uid, el] of pieceEls) {
    if (!seen.has(uid)) { el.remove(); pieceEls.delete(uid); }
  }
}

/* ============================== HUD ============================== */
function updateHUD() {
  for (const side of ['p', 'e'] as const) {
    const hp = G!.hp[side];
    const pct = Math.max(0, hp / MAX_HP * 100) + '%';
    const fill = $(`${side === 'p' ? 'player' : 'enemy'}-hp-fill`);
    fill.style.width = pct;
    fill.classList.toggle('hp-low', hp <= MAX_HP * 0.25 && hp > 0);
    $(`${side === 'p' ? 'player' : 'enemy'}-hp-ghost`).style.width = pct;
    $(`${side === 'p' ? 'player' : 'enemy'}-hp-text`).textContent = `${hp} / ${MAX_HP}`;
    renderHand(side);
    updateCombo(side);
  }
}

function renderHand(side: Side) {
  const tray = $(side === 'p' ? 'player-hand' : 'enemy-hand');
  tray.innerHTML = '';
  for (const id in G!.hands[side]) {
    const n = G!.hands[side][id];
    if (n <= 0) continue;
    const chip = document.createElement('div');
    chip.className = 'hand-chip';
    if (sel && sel.kind === 'hand' && sel.id === id && side === 'p') chip.classList.add('chip-selected');
    chip.innerHTML = `<img src="${YOKAI[id].imgSm}" alt="${YOKAI[id].name}" draggable="false">` +
      (n > 1 ? `<span class="chip-n">×${n}</span>` : '');
    if (side === 'p') chip.addEventListener('click', () => onHandClick(id));
    tray.appendChild(chip);
  }
}

function updateCombo(side: Side) {
  const badge = $(side === 'p' ? 'player-combo' : 'enemy-combo');
  const n = G!.combo[side];
  if (n >= 2) {
    badge.textContent = `${n}COMBO ×${Game.comboMult(n).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
    badge.classList.add('show');
  } else {
    badge.classList.remove('show');
  }
}

/* ---------- 駒情報パネル ---------- */
function showInfo(id: string, promoted: boolean) {
  const def = YOKAI[id];
  const ti = TYPE_INFO[def.type];
  $('piece-info').classList.remove('hidden');
  $<HTMLImageElement>('info-img').src = def.imgSm;
  $('info-type').textContent = ti.label;
  $('info-type').className = `type-chip ${ti.cls}`;
  $('info-name').textContent = def.name + (promoted ? '【成】' : '');
  $('info-atk').textContent = `ATK ${promoted ? Math.round(def.atk * 1.5) : def.atk}`;
  $('info-skill-name').textContent = `【${def.skill.name}】`;
  $('info-skill-desc').textContent = def.skill.desc;
}
function hideInfo() { $('piece-info').classList.add('hidden'); }

/* ============================== 入力 ============================== */
function clearSel() {
  sel = null;
  document.querySelectorAll('.cell').forEach(c =>
    c.classList.remove('hl-move', 'hl-capture', 'hl-drop', 'hl-selected'));
  if (G) renderHand('p');
}

function onCellClick(x: number, y: number) {
  if (!G || G.winner || busy || G.turn !== 'p') return;

  /* 移動先 / 打ち先として有効か */
  if (sel) {
    if (sel.kind === 'piece') {
      const { x: sx, y: sy } = sel;
      const m = sel.moves.find(m => m.x === x && m.y === y);
      if (m) { doAction({ kind: 'move', from: { x: sx, y: sy }, to: { x, y } }); return; }
    } else if (sel.kind === 'hand') {
      const id = sel.id;
      const d = sel.drops.find(d => d.x === x && d.y === y);
      if (d) { doAction({ kind: 'drop', id, to: { x, y } }); return; }
    }
  }

  clearSel();
  const pc = G.board[y][x];
  if (!pc) { hideInfo(); return; }
  showInfo(pc.id, pc.promoted);
  if (pc.owner !== 'p') return; // 敵駒は情報表示のみ

  const moves = Game.getMoves(G, x, y);
  if (moves.length === 0) return;
  sel = { kind: 'piece', x, y, moves };
  AudioSys.play('select');
  cellEl(x, y).classList.add('hl-selected');
  for (const m of moves) cellEl(m.x, m.y).classList.add(m.capture ? 'hl-capture' : 'hl-move');
}

function onHandClick(id: string) {
  if (!G || G.winner || busy || G.turn !== 'p') return;
  if (sel && sel.kind === 'hand' && sel.id === id) { clearSel(); hideInfo(); return; }
  clearSel();
  showInfo(id, false);
  const drops = Game.getDrops(G, 'p', id);
  if (drops.length === 0) return;
  sel = { kind: 'hand', id, drops };
  AudioSys.play('select');
  renderHand('p');
  for (const d of drops) cellEl(d.x, d.y).classList.add('hl-drop');
}

/* ============================== 対局進行 ============================== */
function startBattle() {
  G = Game.newState(Meta.formationRows());
  busy = false;
  sel = null;
  pieceEls.forEach(el => el.remove());
  pieceEls.clear();
  hideInfo();
  clearSel();
  document.querySelectorAll('.cell').forEach(c => c.classList.remove('hl-last'));
  showScreen('screen-battle');
  const boss = YOKAI[Meta.bossId()];
  $<HTMLImageElement>('player-avatar').src = boss.img;
  $('player-name').textContent = boss.name;
  $<HTMLImageElement>('enemy-avatar').src = YOKAI[ENEMY_BOSS].img;
  renderAll();
  updateHUD();
  FX.setAmbient(['rgba(255,170,60,0.35)', 'rgba(130,160,255,0.3)'], 0.025);
  AudioSys.init();
  AudioSys.startBgm();
  showBanner('p');
}

async function doAction(action: Action) {
  busy = true;
  clearSel();
  hideInfo();
  document.querySelectorAll('.cell').forEach(c => c.classList.remove('hl-last'));

  const events = Game.applyAction(G!, action);
  for (const ev of events) await animEvent(ev);

  renderAll();
  updateHUD();
  cellEl(action.to.x, action.to.y).classList.add('hl-last');

  if (G!.winner) { await sleep(750); showResult(); return; }

  if (G!.turn === 'e') {
    showBanner('e');
    $('thinking').classList.remove('hidden');
    await sleep(850 + Math.random() * 550);
    const act = AI.chooseAction(G!);
    $('thinking').classList.add('hidden');
    if (act) { doAction(act); return; }
    // 指し手なし(エンジン側で勝敗確定済みのはず)
    G!.winner = 'p'; G!.reason = 'nomoves';
    showResult();
  } else {
    showBanner('p');
    busy = false;
  }
}

/* ---------- イベント演出 ---------- */
async function animEvent(ev: GameEvent) {
  switch (ev.t) {
    case 'move': {
      const el = pieceEls.get(ev.uid);
      if (el) {
        el.classList.add('moving');
        positionPiece(el, ev.to.x, ev.to.y);
        AudioSys.play('move');
        await sleep(290);
        el.classList.remove('moving');
      }
      break;
    }
    case 'drop': {
      const pc = G!.board[ev.to.y][ev.to.x]!;
      const el = makePieceEl(pc);
      positionPiece(el, ev.to.x, ev.to.y);
      el.classList.add('dropping');
      AudioSys.play('drop');
      const c = cellCenter(ev.to.x, ev.to.y);
      FX.ring(c.x, c.y, ev.owner === 'p' ? 'rgba(140,190,255,0.9)' : 'rgba(255,120,120,0.9)', 14, 46);
      await sleep(380);
      el.classList.remove('dropping');
      renderHand(ev.owner);
      break;
    }
    case 'capture': await animCapture(ev); break;
    case 'promote': {
      const c = cellCenter(ev.to.x, ev.to.y);
      AudioSys.play('promote');
      FX.pillar(c.x, c.y);
      FX.floatLabel(c.x, c.y - 30, '成 !', '#ffd76a');
      const el = pieceEls.get(ev.uid);
      if (el) setPromoted(el);
      await sleep(620);
      break;
    }
    case 'gameover': break; // doAction側で処理
  }
}

async function animCapture(ev: CaptureEvent) {
  const c = cellCenter(ev.at.x, ev.at.y);
  const isPlayer = ev.attacker.owner === 'p';
  const colors = isPlayer ? COLORS_P : COLORS_E;
  const aDef = YOKAI[ev.attacker.id];

  /* スキル発動カットイン */
  for (const proc of ev.procs) {
    await FX.cutin(proc.img, proc.name, proc.text, aDef.type === 'boss' ? 'boss' : 'skill');
  }

  /* 化け狸: 葉隠れ */
  if (ev.decoy) {
    await FX.cutin(ev.decoy.img, ev.decoy.name, 'ダメージ半減! 駒は葉っぱに化けていた', 'counter');
  }

  /* 撃破演出 */
  const victimEl = pieceEls.get(ev.victim.uid);
  if (victimEl) {
    victimEl.classList.add('dying');
    setTimeout(() => { victimEl.remove(); pieceEls.delete(ev.victim.uid); }, 420);
  }

  const big = ev.damage >= 450 || ev.procs.length > 0;
  AudioSys.play(big ? 'bighit' : 'capture');
  FX.burst(c.x, c.y, colors, big ? 44 : 26, big ? 7.5 : 5.5);
  FX.ring(c.x, c.y, colors[0], 16, big ? 80 : 55);
  FX.shake(big);
  FX.damageNumber(c.x, c.y - 14, ev.damage, big ? 'big' : 'normal');

  /* 座敷童子: 回復 */
  if (ev.heal > 0) {
    FX.damageNumber(c.x, c.y - 64, `+${ev.heal}`, 'heal');
  }

  /* コンボ表示 */
  if (ev.combo >= 2) {
    FX.floatLabel(c.x, c.y - 70, `${ev.combo} COMBO!`, isPlayer ? '#6bd6ff' : '#ff8a8a');
  }

  updateHP(ev.hp);
  updateCombo(ev.attacker.owner);
  await sleep(big ? 720 : 560);

  /* 罠の反撃 */
  if (ev.counter) {
    await FX.cutin(ev.counter.img, ev.counter.name, `反撃ダメージ ${ev.counter.dmg}!`, 'counter');
    FX.burst(c.x, c.y, ['#c88aff', '#8a4aff', '#e8d0ff'], 36, 6.5);
    FX.shake(true);
    AudioSys.play('bighit');
    FX.damageNumber(c.x, c.y - 14, ev.counter.dmg, 'counter');
    updateHP(ev.counter.hp);
    await sleep(640);
  }

  /* 鬼火の道連れ */
  if (ev.explode) {
    await FX.cutin(ev.explode.img, ev.explode.name, '取った駒を道連れに爆散!', 'counter');
    const aEl = pieceEls.get(ev.explode.uid);
    if (aEl) {
      aEl.classList.add('dying');
      setTimeout(() => { aEl.remove(); pieceEls.delete(ev.explode!.uid); }, 420);
    }
    FX.burst(c.x, c.y, ['#ff9a3c', '#ff5d5d', '#ffd24a'], 42, 7.2);
    FX.ring(c.x, c.y, '#ff9a3c', 16, 80);
    FX.shake(true);
    AudioSys.play('bighit');
    await sleep(680);
  }
}

function updateHP(hp: Record<Side, number>) {
  for (const side of ['p', 'e'] as const) {
    const pct = Math.max(0, hp[side] / MAX_HP * 100) + '%';
    const pre = side === 'p' ? 'player' : 'enemy';
    const fill = $(`${pre}-hp-fill`);
    fill.style.width = pct;
    fill.classList.toggle('hp-low', hp[side] <= MAX_HP * 0.25 && hp[side] > 0);
    $(`${pre}-hp-ghost`).style.width = pct;
    $(`${pre}-hp-text`).textContent = `${hp[side]} / ${MAX_HP}`;
  }
}

/* ---------- ターンバナー ---------- */
function showBanner(side: Side) {
  const b = $('turn-banner');
  b.textContent = side === 'p' ? 'あなたの手番' : '敵の手番';
  b.className = '';
  void b.offsetWidth;
  b.classList.add(side === 'p' ? 'show-p' : 'show-e');
  if (side === 'p') AudioSys.play('turn');
}

/* ============================== リザルト ============================== */
function showResult() {
  busy = true;
  AudioSys.stopBgm();
  const win = G!.winner === 'p';
  $<HTMLImageElement>('result-boss').src = YOKAI[win ? Meta.bossId() : ENEMY_BOSS].img;
  if (win) {
    /* ソロ勝利報酬はサーバー(またはローカル)が日次上限つきで付与。結果を待って表示を確定 */
    $('result-reward').textContent = '勝利報酬を確認中…';
    $('result-reward').classList.remove('hidden');
    Meta.recordSoloWin().then(reward => {
      $('result-reward').textContent = reward > 0
        ? `勝利報酬: ガチャチケット 🎟 +${reward}`
        : '本日の勝利報酬は上限に達しました';
    }).catch(() => {
      $('result-reward').textContent = '勝利報酬の付与に失敗しました(通信状態を確認)';
    });
  } else {
    $('result-reward').classList.add('hidden');
  }
  const title = $('result-title');
  title.textContent = win ? '討伐成功' : '敗北';
  title.className = win ? 'win' : 'lose';
  const reasons: Record<string, string> = {
    boss: win ? '敵大将・酒呑童子を討ち取った!' : '我が大将が討ち取られた…',
    hp: win ? '酒呑童子の魂力を打ち砕いた!' : '魂力が尽き果てた…',
    explode: win ? '鬼火が敵大将を道連れにした!' : '我が大将が鬼火の道連れに…',
    nomoves: win ? '敵軍は身動きが取れなくなった!' : '我が軍は身動きが取れなくなった…',
    resign: '投了した…',
  };
  $('result-sub').textContent = (G!.reason && reasons[G!.reason]) || '';
  showScreen('screen-result');
  AudioSys.play(win ? 'win' : 'lose');
  if (win) {
    FX.setAmbient(['rgba(255,210,90,0.6)', 'rgba(255,160,60,0.5)'], 0.08);
    FX.confetti();
    setTimeout(() => FX.confetti(), 700);
  } else {
    FX.setAmbient(['rgba(110,90,160,0.4)'], 0.03);
  }
}

/* ============================== ルール画面の駒一覧 ============================== */
function buildRulesPieces() {
  const wrap = $('rules-pieces');
  const order = [
    'kyubi', 'shuten', 'kooni', 'nekomata', 'ittan', 'nue', 'kappa', 'nurikabe', 'tengu', 'rokuro',
    'tamamo', 'nurarihyon', 'ibaraki', 'aooni', 'kasha', 'kamaitachi', 'raiju', 'suiko', 'oonyudo',
    'daitengu', 'hitouban', 'yukionna', 'tsuchigumo', 'sunakake', 'zashiki', 'tanuki', 'onibi',
  ];
  for (const id of order) {
    const def = YOKAI[id];
    const ti = TYPE_INFO[def.type];
    const ri = RARITY_INFO[def.rarity];
    const row = document.createElement('div');
    row.className = 'rule-piece';
    row.innerHTML =
      `<img src="${def.imgSm}" alt="${def.name}">` +
      `<div class="rp-body">` +
      `<div class="rp-name"><span class="type-chip ${ti.cls}">${ti.label}</span>` +
      `<span class="rarity-chip ${ri.cls}">${ri.label}</span> ${def.name} <b>ATK ${def.atk}</b>` +
      (def.gachaOnly ? ' <span class="rp-gacha">ガチャ限定</span>' : '') +
      `</div>` +
      `<div class="rp-move">${def.moveText}</div>` +
      `<div class="rp-move">【${def.skill.name}】${def.skill.desc}</div>` +
      `</div>`;
    wrap.appendChild(row);
  }
}

/* ============================== デバッグ・e2e用フック ============================== */
/* playwright(test/e2e)からモジュール内部にアクセスするための窓口 */
(window as any).yk = {
  Game, AI, Meta, MenuUI, FX, AudioSys,
  YOKAI, GACHA_POOL, SETUP, COLORS_P, COLORS_E,
  $, cellCenter, doAction, renderAll, updateHP, updateHUD, showResult,
  get G() { return G; },
  set G(v: GameState | null) { G = v; },
  get busy() { return busy; },
  set busy(v: boolean) { busy = v; },
};
