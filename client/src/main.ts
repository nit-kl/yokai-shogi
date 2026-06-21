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
import type { AIDifficulty } from './ai';
import {
  SOLO_DIFFICULTIES, SOLO_STAGES, recordSoloClear, soloBattleStage, soloClearCount, soloStage,
} from './solo';
import type { SoloStage } from './solo';
import { Meta } from './meta';
import { MenuUI } from './menu';
import { Onboarding } from './onboarding';
import { FX } from './effects';
import { AudioSys } from './audio';
import { $, sleep, showScreen } from './util';
import { initSentry, captureException } from './sentry';
import { fetchApiStatus } from './status';
import { renderTitleBosses } from './title';
import type { ServerBattleMessage } from '../../shared/battle';
import { OnlineConnection, actionToServer, eventsForView, stateForView } from './online';

let G: GameState | null = null; // ゲーム状態
let busy = false;               // 演出中・AI思考中の入力ロック
type Sel = { kind: 'piece'; x: number; y: number; moves: MoveTarget[] } | { kind: 'hand'; id: string; drops: Pos[] } | null;
let sel: Sel = null;            // 選択中
const pieceEls = new Map<number, HTMLElement>(); // uid -> DOM要素
let online: OnlineConnection | null = null;
let onlineSide: Side | null = null;
let onlineMatch: { matchId: string; reconnectToken: string; opponentName: string; opponentBossId: string } | null = null;
let onlineEndReason: string | null = null;
let onlineReward = 0;
let onlineSeq = 0;
const ONLINE_TURN_MS = 60_000;
const ONLINE_DISCONNECT_MS = 60_000;
const ONLINE_AI_OFFER_MS = 20_000;
let onlineTurnDeadline = 0;
let onlineDisconnectDeadline = 0;
let onlineTimerId: ReturnType<typeof setInterval> | null = null;
let onlineQueueTimerId: ReturnType<typeof setTimeout> | null = null;
let soloStageId = SOLO_STAGES[0].id;
let soloDifficulty: AIDifficulty = 'normal';
let activeSoloStage: SoloStage = soloStage(soloStageId);
let soloClearRecorded = false;
let soloMode: 'single' | 'streak' = 'single';
let soloStreak = 0;
type BattleStats = {
  turns: number;
  captures: Record<Side, number>;
  damage: Record<Side, number>;
  maxCombo: Record<Side, number>;
};
let battleStats: BattleStats = newBattleStats();
const ONLINE_MATCH_KEY = 'yokaiShogi.onlineMatch.v1';
const CONSENT_KEY = 'yokaiShogi.consent.2026-06-13';
type StoredOnlineMatch = {
  matchId: string; reconnectToken: string; opponentName: string; opponentBossId: string; side: Side;
};

const COLORS_P = ['#ffd24a', '#ff9a3c', '#fff6d8', '#ffe9a0'];
const COLORS_E = ['#ff5d5d', '#c84aff', '#ffd0d0', '#ff9a8a'];

/* ============================== 起動 ============================== */
window.addEventListener('DOMContentLoaded', () => {
  void initSentry();
  FX.init();
  buildBoardCells();
  buildPieceCatalog();
  wireButtons();
  MenuUI.init({ enterTitle });
  Onboarding.init({ enterTitle });
  void boot();
  // 初回操作でオーディオ起動
  const audioKick = () => { AudioSys.init(); AudioSys.resume(); };
  addEventListener('pointerdown', audioKick, { once: true });
});

/* 画像プリロードとメタ初期化(認証・ログボ判定)を待ってからタイトルへ */
async function boot() {
  if (__API_URL__ && !hasConsent()) {
    await preloadImages();
    showConsent();
    return;
  }
  const status = await fetchApiStatus();
  if (status?.maintenance) {
    await preloadImages();
    showMaintenance();
    return;
  }
  await Promise.all([
    preloadImages(),
    Meta.init().catch(err => {
      if (Meta.maintenance) { showMaintenance(); return null; }
      console.error('[meta] init failed', err);
      captureException(err);
      return null;
    }),
  ]);
  if (!resumeOnlineMatch()) enterTitle();
}

function showMaintenance(): void {
  showScreen('screen-loading');
  $('maintenance-banner').classList.remove('hidden');
  $('btn-maintenance-retry').onclick = () => {
    $('maintenance-banner').classList.add('hidden');
    void boot();
  };
  $('btn-maintenance-local').onclick = async () => {
    $('maintenance-banner').classList.add('hidden');
    Meta.useLocal();
    await Meta.init();
    enterTitle();
  };
}

function hasConsent(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === 'accepted'; } catch { return false; }
}

function showConsent(): void {
  showScreen('screen-loading');
  $('modal-consent').classList.remove('hidden');
  $('btn-consent-accept').onclick = () => {
    try { localStorage.setItem(CONSENT_KEY, 'accepted'); } catch { /* ignore */ }
    $('modal-consent').classList.add('hidden');
    void boot();
  };
  $('btn-consent-local').onclick = async () => {
    $('modal-consent').classList.add('hidden');
    Meta.useLocal();
    await Meta.init();
    enterTitle();
  };
}

function saveOnlineMatch(): void {
  if (!onlineMatch || !onlineSide) return;
  const stored: StoredOnlineMatch = { ...onlineMatch, side: onlineSide };
  try { sessionStorage.setItem(ONLINE_MATCH_KEY, JSON.stringify(stored)); } catch { /* ignore */ }
}

function clearOnlineMatch(): void {
  try { sessionStorage.removeItem(ONLINE_MATCH_KEY); } catch { /* ignore */ }
}

function resumeOnlineMatch(): boolean {
  if (!Meta.online) return false;
  let stored: StoredOnlineMatch | null = null;
  try { stored = JSON.parse(sessionStorage.getItem(ONLINE_MATCH_KEY) || 'null') as StoredOnlineMatch | null; }
  catch { clearOnlineMatch(); }
  if (!stored?.matchId || !stored.reconnectToken || (stored.side !== 'p' && stored.side !== 'e')) return false;
  onlineSide = stored.side;
  onlineMatch = stored;
  onlineSeq = 0;
  connectMatchmaker({ matchId: stored.matchId, reconnectToken: stored.reconnectToken });
  return true;
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
  stopOnlineTimer();
  if (!Meta.isOnboardingDone()) {
    void Onboarding.start();
    return;
  }
  renderTitleBosses(Meta.bossId());
  showScreen('screen-title');
  FX.setAmbient(['rgba(130,160,255,0.55)', 'rgba(200,120,255,0.5)', 'rgba(232,196,106,0.45)'], 0.05);
  AudioSys.init();
  AudioSys.startTitleBgm();
  MenuUI.onEnterTitle();
  $('btn-online').classList.toggle('hidden', !Meta.onlineAvailable);
}

/* ---------- ボタン類 ---------- */
function wireButtons() {
  $('btn-start').onclick = () => { AudioSys.init(); AudioSys.play('click'); openSolo(); };
  $('btn-solo-back').onclick = () => { AudioSys.play('click'); enterTitle(); };
  $('btn-solo-battle').onclick = () => { AudioSys.play('click'); soloStreak = 0; startBattle(); };
  $('btn-solo-single').onclick = () => { AudioSys.play('select'); soloMode = 'single'; renderSoloSelect(); };
  $('btn-solo-streak').onclick = () => { AudioSys.play('select'); soloMode = 'streak'; soloStageId = 'hyakki'; renderSoloSelect(); };
  $('btn-videos').onclick = () => openVideos();
  $('btn-videos-close').onclick = () => closeVideos();
  $('btn-video-trailer').onclick = () => playVideo('EjzXcCEKYSI', 'btn-video-trailer');
  $('btn-video-short').onclick = () => playVideo('LClFmrqygTQ', 'btn-video-short');
  $('btn-online').onclick = () => { void openOnline(); };
  $('btn-online-close').onclick = () => closeOnlineModal();
  $('btn-online-random').onclick = () => {
    connectMatchmaker();
    online?.send({ t: 'join_queue' });
    $('online-message').textContent = '対戦相手を探しています…';
    startOnlineQueueTimer();
  };
  $('btn-online-ai').onclick = () => switchQueueToAi();
  $('btn-online-create').onclick = () => { connectMatchmaker(); online?.send({ t: 'create_room' }); };
  $('btn-online-join').onclick = () => {
    const code = $<HTMLInputElement>('online-code-input').value.trim().toUpperCase();
    if (!code) return;
    connectMatchmaker();
    online?.send({ t: 'join_room', code });
    $('online-message').textContent = 'ルームへ参加しています…';
  };
  $('btn-rules').onclick = () => { AudioSys.play('click'); $('modal-rules').classList.remove('hidden'); };
  $('btn-rules2').onclick = () => { AudioSys.play('click'); $('modal-rules').classList.remove('hidden'); };
  $('btn-close-rules').onclick = () => { AudioSys.play('click'); $('modal-rules').classList.add('hidden'); };
  $('btn-pieces').onclick = () => {
    AudioSys.play('click');
    showScreen('screen-pieces');
    FX.setAmbient(['rgba(88,182,255,0.4)', 'rgba(200,120,255,0.4)', 'rgba(232,196,106,0.35)'], 0.04);
  };
  $('btn-pieces-back').onclick = () => { AudioSys.play('click'); enterTitle(); };
  $('btn-mute').onclick = () => {
    AudioSys.init();
    $('btn-mute').textContent = AudioSys.toggle() ? '🔊' : '🔇';
  };
  $('btn-resign').onclick = () => {
    if (!G || G.winner || (!onlineSide && busy)) return;
    if (confirm('投了しますか?')) {
      if (onlineSide) { online?.send({ t: 'resign' }); return; }
      G.winner = 'e'; G.reason = 'resign';
      showResult();
    }
  };
  $('btn-retry').onclick = () => {
    AudioSys.play('click');
    if (onlineSide) { online?.close(); clearOnlineMatch(); onlineSide = null; onlineMatch = null; enterTitle(); }
    else {
      if (soloMode === 'streak' && G?.winner !== 'p') soloStreak = 0;
      startBattle();
    }
  };
  $('btn-title').onclick = () => {
    AudioSys.play('click');
    AudioSys.stopBgm();
    online?.close();
    clearOnlineMatch();
    online = null; onlineSide = null; onlineMatch = null;
    enterTitle();
  };
}

function openSolo() {
  renderSoloSelect();
  showScreen('screen-solo');
  FX.setAmbient(['rgba(255,170,60,0.35)', 'rgba(200,120,255,0.4)', 'rgba(88,182,255,0.3)'], 0.04);
}

function renderSoloSelect() {
  $('btn-solo-single').classList.toggle('active', soloMode === 'single');
  $('btn-solo-streak').classList.toggle('active', soloMode === 'streak');
  const completed = SOLO_STAGES.reduce((sum, stage) =>
    sum + SOLO_DIFFICULTIES.filter(difficulty => soloClearCount(stage.id, difficulty.id) > 0).length, 0);
  $('solo-progress').textContent = `攻略記録 ${completed} / ${SOLO_STAGES.length * SOLO_DIFFICULTIES.length}`;
  const stages = $('solo-stages');
  stages.replaceChildren();
  for (const stage of SOLO_STAGES) {
    const boss = YOKAI[stage.bossId];
    const card = document.createElement('button');
    card.className = 'solo-stage-card' + (stage.id === soloStageId ? ' selected' : '');

    const bossImg = document.createElement('img');
    bossImg.src = boss.imgSm;
    bossImg.alt = boss.name;
    card.appendChild(bossImg);

    const body = document.createElement('div');
    body.className = 'solo-stage-body';

    const head = document.createElement('div');
    head.className = 'solo-stage-head';
    const trait = document.createElement('span');
    trait.textContent = stage.trait;
    const title = document.createElement('b');
    title.textContent = stage.name;
    head.append(trait, title);

    const bossLine = document.createElement('div');
    bossLine.className = 'solo-stage-boss';
    bossLine.textContent = `大将 ${boss.name}`;

    const desc = document.createElement('p');
    desc.textContent = stage.desc;

    const pieces = document.createElement('div');
    pieces.className = 'solo-stage-pieces';
    for (const id of stage.enemyRows.flat().filter(Boolean)) {
      const yokai = YOKAI[id!];
      const pieceImg = document.createElement('img');
      pieceImg.src = yokai.imgSm;
      pieceImg.alt = yokai.name;
      pieceImg.title = yokai.name;
      pieces.appendChild(pieceImg);
    }

    const clears = document.createElement('div');
    clears.className = 'solo-stage-clears';
    for (const difficulty of SOLO_DIFFICULTIES) {
      const count = soloClearCount(stage.id, difficulty.id);
      const badge = document.createElement('span');
      if (count) badge.classList.add('cleared');
      badge.textContent = count ? `${difficulty.name} ${count}` : difficulty.name;
      clears.appendChild(badge);
    }

    body.append(head, bossLine, desc, pieces, clears);
    card.appendChild(body);
    card.onclick = () => {
      AudioSys.play('select');
      soloStageId = stage.id;
      if (stage.id !== 'hyakki') soloMode = 'single';
      renderSoloSelect();
    };
    stages.appendChild(card);
  }

  const difficulties = $('solo-difficulties');
  difficulties.replaceChildren();
  for (const difficulty of SOLO_DIFFICULTIES) {
    const button = document.createElement('button');
    button.className = 'solo-difficulty' + (difficulty.id === soloDifficulty ? ' selected' : '');
    const count = soloClearCount(soloStageId, difficulty.id);
    const name = document.createElement('b');
    name.textContent = count ? `${difficulty.name} ✓` : difficulty.name;
    const info = document.createElement('span');
    info.textContent = difficulty.desc;
    const status = document.createElement('small');
    status.textContent = count ? `勝利 ${count}回` : '未攻略';
    button.append(name, info, status);
    button.onclick = () => { AudioSys.play('select'); soloDifficulty = difficulty.id; renderSoloSelect(); };
    difficulties.appendChild(button);
  }
}

async function openOnline() {
  AudioSys.play('click');
  $('online-room-code').classList.add('hidden');
  clearOnlineQueueTimer();
  $('modal-online').classList.remove('hidden');
  if (!Meta.online) {
    $('online-message').textContent = 'オンラインへ接続しています…';
    try {
      await Meta.init();
      if (!Meta.online) throw new Error('online connection unavailable');
      MenuUI.onEnterTitle();
    } catch (err) {
      console.error('[meta] online retry failed', err);
      captureException(err);
      $('online-message').textContent = 'オンライン接続に失敗しました。通信状態を確認して、もう一度お試しください';
      return;
    }
  }
  $('online-message').textContent = '対戦方法を選んでください';
}

function openVideos() {
  AudioSys.play('click');
  $('modal-videos').classList.remove('hidden');
}

function playVideo(videoId: string, activeButtonId: string) {
  AudioSys.stopBgm();
  for (const id of ['btn-video-trailer', 'btn-video-short']) {
    $(id).classList.toggle('active', id === activeButtonId);
  }
  const player = $<HTMLIFrameElement>('video-player');
  player.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`;
  $('video-player-wrap').classList.remove('hidden');
}

function closeVideos() {
  $<HTMLIFrameElement>('video-player').src = '';
  $('video-player-wrap').classList.add('hidden');
  $('btn-video-trailer').classList.remove('active');
  $('btn-video-short').classList.remove('active');
  $('modal-videos').classList.add('hidden');
  AudioSys.startTitleBgm();
}

function closeOnlineModal() {
  online?.send({ t: 'leave_queue', reason: 'cancel' });
  clearOnlineQueueTimer();
  online?.close();
  online = null;
  $('modal-online').classList.add('hidden');
}

function connectMatchmaker(extra: Record<string, string> = {}) {
  if (online) return;
  const url = Meta.battleUrl();
  if (!url) { $('online-message').textContent = 'オンライン接続が利用できません'; return; }
  online = new OnlineConnection(url);
  online.onMessage = message => { void onOnlineMessage(message); };
  online.onState = state => {
    if (state === 'connected' && onlineMatch) {
      setOnlineConnection('接続済み');
    } else if (state === 'disconnected' && onlineMatch) {
      setOnlineConnection('再接続中…', true);
      setTimeout(() => online?.connect({
        matchId: onlineMatch!.matchId, reconnectToken: onlineMatch!.reconnectToken,
      }), 1000);
    } else if (state !== 'connected') {
      $('online-message').textContent = state === 'error' ? '接続エラーが発生しました' : '接続が切れました';
    }
  };
  online.connect(extra);
}

async function onOnlineMessage(message: ServerBattleMessage) {
  if (message.t === 'queued') {
    $('online-message').textContent = `対戦相手を探しています(待機 ${message.position}番目)`;
  } else if (message.t === 'room_created') {
    $('online-message').textContent = 'このコードを相手に伝えてください';
    $('online-room-code').textContent = message.code;
    $('online-room-code').classList.remove('hidden');
  } else if (message.t === 'error') {
    $('online-message').textContent = message.message;
    busy = false;
  } else if (message.t === 'match_found') {
    clearOnlineQueueTimer();
    onlineSide = message.side;
    onlineSeq = 0;
    onlineMatch = {
      matchId: message.matchId, reconnectToken: message.reconnectToken,
      opponentName: message.opponent.name, opponentBossId: message.opponent.bossId,
    };
    saveOnlineMatch();
    $('modal-online').classList.add('hidden');
    online!.connect({ matchId: message.matchId, reconnectToken: message.reconnectToken });
  } else if (message.t === 'snapshot') {
    if (!onlineSide) return;
    const entering = !$('screen-battle').classList.contains('active');
    const shouldRender = entering || pieceEls.size === 0 || message.seq <= onlineSeq;
    G = stateForView(message.state, onlineSide);
    if (entering) startOnlineBattle();
    if (shouldRender) { renderAll(); updateHUD(); }
    onlineSeq = message.seq;
    busy = G.turn !== 'p';
    setOnlineConnection('接続済み');
    setOnlineTurnTimer(message.remainMs);
  } else if (message.t === 'events') {
    if (!onlineSide) return;
    busy = true;
    for (const event of eventsForView(message.events, onlineSide)) await animEvent(event);
    renderAll();
    updateHUD();
    onlineSeq = message.seq;
    if (G && !G.winner) busy = G.turn !== 'p';
    renderOnlineTimers();
  } else if (message.t === 'your_turn') {
    setOnlineTurnTimer(message.remainMs);
    if (G?.turn === 'p') { busy = false; showBanner('p'); }
  } else if (message.t === 'opponent_disconnected') {
    setOpponentDisconnectTimer(message.graceMs);
  } else if (message.t === 'opponent_reconnected') {
    clearOpponentDisconnectTimer();
  } else if (message.t === 'game_end') {
    if (!G || !onlineSide) return;
    G.winner = message.winner === 'draw' ? null : (message.winner === onlineSide ? 'p' : 'e');
    onlineEndReason = message.reason;
    onlineReward = message.reward.tickets;
    if (message.reward.tickets > 0) Meta.addTickets(message.reward.tickets);
    clearOnlineMatch();
    stopOnlineTimer();
    showResult();
  }
}

function startOnlineQueueTimer(): void {
  clearOnlineQueueTimer();
  onlineQueueTimerId = setTimeout(() => {
    onlineQueueTimerId = null;
    $('online-message').textContent = 'まだ相手が見つかりません。待機を続けるか、すぐにAIと対戦できます。';
    $('btn-online-ai').classList.remove('hidden');
  }, ONLINE_AI_OFFER_MS);
}

function clearOnlineQueueTimer(): void {
  if (onlineQueueTimerId !== null) clearTimeout(onlineQueueTimerId);
  onlineQueueTimerId = null;
  $('btn-online-ai').classList.add('hidden');
}

function switchQueueToAi(): void {
  online?.send({ t: 'leave_queue', reason: 'timeout' });
  clearOnlineQueueTimer();
  online?.close();
  online = null;
  $('modal-online').classList.add('hidden');
  soloMode = 'single';
  soloDifficulty = 'normal';
  startBattle();
}

function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function ensureOnlineTimer(): void {
  if (onlineTimerId === null) onlineTimerId = setInterval(renderOnlineTimers, 250);
  renderOnlineTimers();
}

function stopOnlineTimer(): void {
  if (onlineTimerId !== null) clearInterval(onlineTimerId);
  onlineTimerId = null;
  onlineTurnDeadline = 0;
  clearOpponentDisconnectTimer();
}

function setOnlineTurnTimer(remainMs: number): void {
  onlineTurnDeadline = Date.now() + Math.max(0, remainMs);
  ensureOnlineTimer();
}

function setOpponentDisconnectTimer(graceMs: number): void {
  onlineDisconnectDeadline = Date.now() + Math.max(0, graceMs);
  $('online-disconnect-block').classList.remove('hidden');
  ensureOnlineTimer();
}

function clearOpponentDisconnectTimer(): void {
  onlineDisconnectDeadline = 0;
  $('online-disconnect-block').classList.add('hidden');
}

function setOnlineConnection(label: string, reconnecting = false): void {
  $('online-connection-label').textContent = label;
  $('online-status').classList.toggle('reconnecting', reconnecting);
}

function renderOnlineTimers(): void {
  const now = Date.now();
  const turnRemain = Math.max(0, onlineTurnDeadline - now);
  const ownTurn = G?.turn === 'p';
  $('online-turn-label').textContent = ownTurn ? 'あなたの手番' : '相手の手番';
  $('online-turn-time').textContent = formatCountdown(turnRemain);
  $('online-turn-fill').style.width = `${Math.min(100, turnRemain / ONLINE_TURN_MS * 100)}%`;
  $('online-status').classList.toggle('opponent-turn', !ownTurn);
  $('online-status').classList.toggle('timer-low', turnRemain > 0 && turnRemain <= 10_000);

  if (onlineDisconnectDeadline > 0) {
    const graceRemain = Math.max(0, onlineDisconnectDeadline - now);
    $('online-disconnect-time').textContent = formatCountdown(graceRemain);
    $('online-disconnect-fill').style.width = `${Math.min(100, graceRemain / ONLINE_DISCONNECT_MS * 100)}%`;
  }
}

function startOnlineBattle() {
  busy = true;
  sel = null;
  pieceEls.forEach(el => el.remove());
  pieceEls.clear();
  hideInfo();
  clearSel();
  showScreen('screen-battle');
  const boss = YOKAI[Meta.bossId()];
  $<HTMLImageElement>('player-avatar').src = boss.img;
  $('player-name').textContent = Meta.data.name;
  $<HTMLImageElement>('enemy-avatar').src = YOKAI[onlineMatch?.opponentBossId || ENEMY_BOSS].img;
  $('enemy-hud').querySelector('.hud-name')!.lastChild!.textContent = onlineMatch?.opponentName || '対戦相手';
  $('online-status').classList.remove('hidden');
  setOnlineConnection('接続済み');
  ensureOnlineTimer();
  FX.setAmbient(['rgba(255,170,60,0.35)', 'rgba(130,160,255,0.3)'], 0.025);
  AudioSys.init();
  AudioSys.startBattleBgm();
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
  el.className = `piece owner-${pc.owner}`
    + (YOKAI[pc.id].type === 'boss' ? ' boss-piece' : '')
    + (YOKAI[pc.id].variantOf ? ' special-piece' : '');
  const specialColors = YOKAI[pc.id].summonColors;
  if (specialColors) {
    el.style.setProperty('--special-light', specialColors[0]);
    el.style.setProperty('--special-primary', specialColors[1]);
  }
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
    chip.addEventListener('click', () => {
      if (side === 'p') onHandClick(id);
      else showInfo(id, false);
    });
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
  $('info-move').textContent = def.moveText;
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
  if (!G) return;

  const pc = G.board[y][x];
  if (pc) showInfo(pc.id, pc.promoted);
  if (G.winner || busy || G.turn !== 'p') return;

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
  if (!pc) { hideInfo(); return; }
  if (pc.owner !== 'p') return; // 敵駒は情報表示のみ

  const moves = Game.getMoves(G, x, y);
  if (moves.length === 0) return;
  sel = { kind: 'piece', x, y, moves };
  AudioSys.play('select');
  cellEl(x, y).classList.add('hl-selected');
  for (const m of moves) cellEl(m.x, m.y).classList.add(m.capture ? 'hl-capture' : 'hl-move');
}

function onHandClick(id: string) {
  if (!G) return;
  showInfo(id, false);
  if (G.winner || busy || G.turn !== 'p') return;
  if (sel && sel.kind === 'hand' && sel.id === id) { clearSel(); hideInfo(); return; }
  clearSel();
  const drops = Game.getDrops(G, 'p', id);
  if (drops.length === 0) return;
  sel = { kind: 'hand', id, drops };
  AudioSys.play('select');
  renderHand('p');
  for (const d of drops) cellEl(d.x, d.y).classList.add('hl-drop');
}

/* ============================== 対局進行 ============================== */
function startBattle() {
  const stage = soloBattleStage(soloMode === 'streak' ? 'hyakki' : soloStageId);
  activeSoloStage = stage;
  soloClearRecorded = false;
  battleStats = newBattleStats();
  onlineSide = null;
  onlineEndReason = null;
  onlineReward = 0;
  stopOnlineTimer();
  $('online-status').classList.add('hidden');
  G = Game.newState(Meta.formationRows(), stage.enemyRows);
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
  $('player-name').textContent = Meta.data.name;
  $<HTMLImageElement>('enemy-avatar').src = YOKAI[stage.bossId].img;
  $('enemy-name').textContent = YOKAI[stage.bossId].name;
  renderAll();
  updateHUD();
  FX.setAmbient(['rgba(255,170,60,0.35)', 'rgba(130,160,255,0.3)'], 0.025);
  AudioSys.init();
  AudioSys.startBattleBgm();
  showBanner('p');
}

async function doAction(action: Action) {
  busy = true;
  clearSel();
  hideInfo();
  document.querySelectorAll('.cell').forEach(c => c.classList.remove('hl-last'));

  if (onlineSide) {
    online?.send({ t: 'action', action: actionToServer(action, onlineSide) });
    return;
  }

  const events = Game.applyAction(G!, action);
  recordBattleStats(events);
  for (const ev of events) await animEvent(ev);

  renderAll();
  updateHUD();
  cellEl(action.to.x, action.to.y).classList.add('hl-last');

  if (G!.winner) { await sleep(750); showResult(); return; }

  if (G!.turn === 'e') {
    showBanner('e');
    $('thinking').classList.remove('hidden');
    await sleep(850 + Math.random() * 550);
    const act = AI.chooseAction(G!, soloDifficulty);
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

function newBattleStats(): BattleStats {
  return {
    turns: 0,
    captures: { p: 0, e: 0 },
    damage: { p: 0, e: 0 },
    maxCombo: { p: 0, e: 0 },
  };
}

function recordBattleStats(events: GameEvent[]) {
  battleStats.turns++;
  for (const event of events) {
    if (event.t !== 'capture') continue;
    const side = event.attacker.owner;
    const foe: Side = side === 'p' ? 'e' : 'p';
    battleStats.captures[side]++;
    battleStats.damage[side] += event.damage;
    battleStats.maxCombo[side] = Math.max(battleStats.maxCombo[side], event.combo);
    if (event.counter) battleStats.damage[foe] += event.counter.dmg;
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
  const draw = onlineEndReason === 'draw';
  const win = G!.winner === 'p';
  const enemyBoss = onlineSide ? (onlineMatch?.opponentBossId || ENEMY_BOSS) : activeSoloStage.bossId;
  const enemyBossName = YOKAI[enemyBoss].name;
  $<HTMLImageElement>('result-boss').src = YOKAI[win ? Meta.bossId() : enemyBoss].img;
  if (win && !onlineSide) {
    if (!soloClearRecorded) {
      recordSoloClear(soloStageId, soloDifficulty);
      soloClearRecorded = true;
      if (soloMode === 'streak') soloStreak++;
    }
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
  } else if (win && onlineSide && onlineReward > 0) {
    $('result-reward').textContent = `勝利報酬: ガチャチケット 🎟 +${onlineReward}`;
    $('result-reward').classList.remove('hidden');
  } else {
    $('result-reward').classList.add('hidden');
  }
  const title = $('result-title');
  title.textContent = draw ? '引き分け' : win ? '討伐成功' : '敗北';
  title.className = win ? 'win' : 'lose';
  const reasons: Record<string, string> = {
    boss: win ? `敵大将・${enemyBossName}を討ち取った!` : '我が大将が討ち取られた…',
    hp: win ? `${enemyBossName}の魂力を打ち砕いた!` : '魂力が尽き果てた…',
    explode: win ? '鬼火が敵大将を道連れにした!' : '我が大将が鬼火の道連れに…',
    nomoves: win ? '敵軍は身動きが取れなくなった!' : '我が軍は身動きが取れなくなった…',
    resign: '投了した…',
    timeout: win ? '相手の持ち時間が切れた' : '持ち時間が切れた…',
    disconnect: win ? '相手の再接続猶予が切れた' : '再接続猶予が切れた…',
    draw: '300手に達したため引き分け',
  };
  $('result-sub').textContent = reasons[onlineEndReason || G!.reason || ''] || '';
  renderResultStats();
  const retry = $('btn-retry');
  retry.textContent = soloMode === 'streak' && !onlineSide && win ? '次の軍勢へ' : '再戦';
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

function renderResultStats() {
  const stats = $('result-stats');
  if (onlineSide) {
    stats.classList.add('hidden');
    return;
  }
  const hp = G?.hp.p || 0;
  const hpPct = Math.round(hp / MAX_HP * 100);
  const streak = soloMode === 'streak'
    ? `<div class="result-stat result-streak">百鬼夜行 ${soloStreak}連勝</div>`
    : '';
  stats.innerHTML = streak +
    `<div class="result-stat">手数<b>${battleStats.turns}</b></div>` +
    `<div class="result-stat">撃破数<b>${battleStats.captures.p}</b></div>` +
    `<div class="result-stat">与ダメージ<b>${battleStats.damage.p}</b></div>` +
    `<div class="result-stat">被ダメージ<b>${battleStats.damage.e}</b></div>` +
    `<div class="result-stat">最大コンボ<b>${battleStats.maxCombo.p}</b></div>` +
    `<div class="result-stat">残り魂力<b>${hpPct}%</b></div>`;
  stats.classList.remove('hidden');
}

/* ============================== 駒一覧 ============================== */
function buildPieceCatalog() {
  const wrap = $('pieces-list');
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
    row.className = `piece-card ${ri.cls}`;
    row.innerHTML =
      `<img src="${def.imgSm}" alt="${def.name}">` +
      `<div class="rp-body">` +
      `<div class="rp-name"><span class="type-chip ${ti.cls}">${ti.label}</span>` +
      `<span class="rarity-chip ${ri.cls}">${ri.label}</span> ${def.name} <b>ATK ${def.atk}</b>` +
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
  Game, AI, Meta, MenuUI, FX, AudioSys, Onboarding,
  YOKAI, GACHA_POOL, SETUP, COLORS_P, COLORS_E,
  $, cellCenter, doAction, renderAll, updateHP, updateHUD, showResult,
  get G() { return G; },
  set G(v: GameState | null) { G = v; },
  get busy() { return busy; },
  set busy(v: boolean) { busy = v; },
};
