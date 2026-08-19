/* ============================================================
   百鬼盤 - メインUIコントローラ
   ============================================================ */

import {
  COLS, ROWS, MAX_HP, ZONE_DEPTH, YOKAI, RARITY_INFO,
  ALL_IMAGES, ENEMY_BOSS, GACHA_POOL, SETUP,
  RESONANCES, MOON_PHASES, baseIdOf,
} from '../../shared/data';
import type { Rarity, Side } from '../../shared/data';
import { AWAKEN_ATK, AWAKEN_MAX, Game, HUNGER_DRAIN, MOON_CYCLE } from '../../shared/game';
import type { Action, GameEvent, GameState, MoveTarget, Pos, CaptureEvent } from '../../shared/game';
import { Records } from './records';
import { AI } from './ai';
import { HYAKKI_STAGE, soloBattleStage } from './solo';
import type { SoloStage } from './solo';
import { Meta } from './meta';
import type { HyakkiRanking } from './meta';
import { SessionExpiredError } from './meta';
import { HYAKKI_RANK_DIFFICULTY, HYAKKI_REWARD_YOKAI_ID } from '../../shared/hyakki';
import { MenuUI } from './menu';
import { Onboarding } from './onboarding';
import { FX } from './effects';
import { AudioSys } from './audio';
import { $, sleep, showScreen } from './util';
import { initSentry, captureException } from './sentry';
import { fetchApiStatus } from './status';
import { renderTitleBosses } from './title';
import { SupportUI } from './support';
import { RegistrationStatsUI } from './registration-stats';
import { MatchHourUI } from './match-hour';
import { AnnouncementsUI } from './announcements';
import { trackLandingEvent, trackLandingEventOnce } from './analytics';
import type { ClockPhase, ServerBattleMessage } from '../../shared/battle';
import { OnlineConnection, actionToServer, eventsForView, stateForView } from './online';
import { initializeLocale } from './locale';

let G: GameState | null = null; // ゲーム状態
let busy = false;               // 演出中・AI思考中の入力ロック
type Sel =
  | { kind: 'piece'; x: number; y: number; moves: MoveTarget[] }
  | { kind: 'hand'; id: string; drops: Pos[] }
  | { kind: 'awaken'; targets: Pos[] }
  | { kind: 'phase'; from: Pos; to: Pos; options: Pos[] } // 影遁/隱形の退避先選択(残留=to自身)
  | { kind: 'spawn'; from: Pos; to: Pos; options: Pos[] } // 送り火の設置先選択
  | { kind: 'dual'; from: Pos; to: Pos; options: Pos[] } // 双面の追撃先選択
  | null;
let sel: Sel = null;            // 選択中
const pieceEls = new Map<number, HTMLElement>(); // uid -> DOM要素
let online: OnlineConnection | null = null;
let onlineSide: Side | null = null;
let onlineMatch: { matchId: string; reconnectToken: string; opponentName: string; opponentBossId: string } | null = null;
let onlineEndReason: string | null = null;
let onlineReward = 0;
let onlineParticipation = 0;
let onlineEventYokai: string | null = null;
let onlineSeq = 0;
const ONLINE_TURN_MS = 60_000;
const ONLINE_BYOYOMI_MS = 30_000;
const ONLINE_DISCONNECT_MS = 60_000;
const ONLINE_AI_OFFER_MS = 20_000;
const ONLINE_TIMER_WARN_MS = 20_000;
const ONLINE_TIMER_LOW_MS = 10_000;
let onlineTurnDeadline = 0;
let onlineClockPhase: ClockPhase = 'main';
let onlineTimerTickSec = -1;
let onlineDisconnectDeadline = 0;
let onlineTimerId: ReturnType<typeof setInterval> | null = null;
let onlineQueueTimerId: ReturnType<typeof setTimeout> | null = null;
let activeSoloStage: SoloStage = HYAKKI_STAGE;
let pendingSoloStage: SoloStage | null = null;
let soloStreak = 0;
let soloBestStreak = 0;
let soloRank: number | null = null;
let soloWinCounted = false;
let hyakkiRanking: HyakkiRanking | null = null;
let hyakkiRankingAt = 0; // 最終取得時刻(60秒キャッシュ)
let rankingReturn: 'title' | 'solo' = 'title';
const ONLINE_MATCH_KEY = 'yokaiShogi.onlineMatch.v1';
const CONSENT_KEY = 'yokaiShogi.consent.2026-06-13';
type StoredOnlineMatch = {
  matchId: string; reconnectToken: string; opponentName: string; opponentBossId: string; side: Side;
};

const COLORS_P = ['#ffd24a', '#ff9a3c', '#fff6d8', '#ffe9a0'];
const COLORS_E = ['#ff5d5d', '#c84aff', '#ffd0d0', '#ff9a8a'];

/* SSR・異装・大将の専用演出色 [light, primary, accent] */
const SSR_FX_COLORS = ['#fff6d8', '#ffd24a', '#ff9a3c'] as const;
/* デフォルト大将はsummonColorsを持たないためここで定義(九尾=業火、酒呑=鬼の緋) */
const BOSS_FX_COLORS: Record<string, readonly string[]> = {
  kyubi: ['#fff1d0', '#ff9d3c', '#ff4b2e'],
  shuten: ['#ffd8d8', '#ff4d4d', '#a12828'],
};
function specialFxColors(id: string): readonly string[] | null {
  const def = YOKAI[id];
  if (!def) return null;
  if (def.variantOf) return def.summonColors ?? SSR_FX_COLORS;
  if (def.boss) return def.summonColors ?? BOSS_FX_COLORS[id] ?? SSR_FX_COLORS;
  if (def.rarity === 'SSR' && (def.gachaOnly || def.limited)) return SSR_FX_COLORS;
  return null;
}

/* スキル系統ごとの演出色 [light, primary, accent]。
   crit=炎 / rush=疾風 / zone=突撃の藍 / heal=緑 / counter=呪詛の紫 / decoy=木の葉 / explode=爆炎 */
const SKILL_KIND_FX: Record<string, readonly string[]> = {
  crit: ['#ffe2b8', '#ff8a3c', '#ff3c2e'],
  rush: ['#e8fffb', '#8ff0e0', '#2ea8a0'],
  zone: ['#dce8ff', '#7fa8ff', '#4055ff'],
  heal: ['#eafff2', '#7cf2a4', '#2ecc71'],
  counter: ['#e8d0ff', '#c88aff', '#8a4aff'],
  decoy: ['#eaffd0', '#a8e063', '#4caf50'],
  explode: ['#ffd24a', '#ff9a3c', '#ff5d5d'],
  moon: ['#f2ecff', '#b9a8ff', '#6157d6'],    // 月光の藍紫
  heads: ['#ffe2b8', '#ff8a3c', '#8d1f1f'],   // 大蛇の劫火
  legion: ['#dbe7ff', '#8ba0e8', '#d98945'],  // 百鬼夜行の宵闇
  retreat: ['#e8e0ff', '#a898e0', '#6a5acd'], // 帰影
  phase: ['#dde8f0', '#9ab0c0', '#5a7080'],   // 影遁の煙
  ember: ['#ffe8c8', '#ff9a4a', '#e85a20'],   // 残火
  veil: ['#f0e8ff', '#c0a8e8', '#7a58c0'],    // 隱形
  spawn: ['#ffe8c8', '#ff9a4a', '#e85a20'],
  charm: ['#fff0d8', '#e8a050', '#b21f32'],   // 傾国
  recall: ['#ffdbc2', '#ff4d4d', '#8d47d6'],  // 羅生門
  hydra: ['#ffe2b8', '#ff8a3c', '#8d1f1f'],   // 八岐
  famine: ['#e8d8c8', '#8a6a4a', '#3a2010'],  // 餓鬼
  dual: ['#ffe0e8', '#e05070', '#8a1030'],    // 双面
};
/* 会心系(発動="当たり")として扱うスキル */
const JACKPOT_KINDS = new Set(['crit', 'rush', 'moon', 'heads', 'famine']);

/* レアリティ段階(演出の格): N=0, R=1, SR=2, SSR・異装=3 */
function rarityTier(id: string): 0 | 1 | 2 | 3 {
  const def = YOKAI[id];
  if (!def) return 0;
  if (def.variantOf || def.rarity === 'SSR') return 3;
  return def.rarity === 'SR' ? 2 : def.rarity === 'R' ? 1 : 0;
}
const TIER_SCALE = [0.75, 1, 1.3, 1.6] as const;

/* ============================== 起動 ============================== */
window.addEventListener('DOMContentLoaded', () => {
  initializeLocale();
  trackLandingEventOnce('app_loaded', 'app_loaded');
  void initSentry();
  FX.init();
  buildBoardCells();
  buildPieceCatalog();
  wireButtons();
  MenuUI.init({ enterTitle });
  AnnouncementsUI.init();
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
  let sessionExpired = false;
  await Promise.all([
    preloadImages(),
    Meta.init().catch(err => {
      if (Meta.maintenance) { showMaintenance(); return null; }
      if (err instanceof SessionExpiredError) {
        sessionExpired = true;
        return null;
      }
      console.error('[meta] init failed', err);
      captureException(err);
      return null;
    }),
  ]);
  if (sessionExpired) {
    MenuUI.openSessionRecovery();
    return;
  }
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
  $('combo-vignette').className = '';
  if (!Meta.isOnboardingDone()) {
    trackLandingEventOnce('onboarding_start', 'onboarding_start', { online: Meta.online });
    void Onboarding.start();
    return;
  }
  renderTitleBosses(Meta.bossId());
  showScreen('screen-title');
  trackLandingEvent('title_view', { online: Meta.online, onlineAvailable: Meta.onlineAvailable });
  FX.setAmbient(['rgba(130,160,255,0.55)', 'rgba(200,120,255,0.5)', 'rgba(232,196,106,0.45)'], 0.05);
  AudioSys.init();
  AudioSys.startTitleBgm();
  MenuUI.onEnterTitle();
  void AnnouncementsUI.refresh({ popup: true });
  $('btn-online').classList.toggle('hidden', !Meta.onlineAvailable);
  if (Meta.onlineAvailable) {
    RegistrationStatsUI.startPolling();
    MatchHourUI.start();
  } else {
    RegistrationStatsUI.stopPolling();
    MatchHourUI.stop();
  }
}

/* ---------- ボタン類 ---------- */
function wireButtons() {
  $('btn-start').onclick = () => {
    trackLandingEvent('solo_cta_click', { source: 'title' });
    AudioSys.init();
    AudioSys.play('click');
    openSolo();
  };
  $('btn-solo-back').onclick = () => { AudioSys.play('click'); enterTitle(); };
  $('btn-solo-battle').onclick = () => { AudioSys.play('click'); openHyakkiPreview(); };
  $('btn-solo-formation').onclick = () => {
    AudioSys.play('click');
    MenuUI.openFormation({ onReturn: () => openSolo() });
  };
  $('btn-solo-ranking').onclick = () => {
    trackLandingEvent('hyakki_rank_view', { source: 'solo_lobby' });
    AudioSys.play('click');
    openRanking('solo');
  };
  $('btn-hyakki-preview-back').onclick = () => { AudioSys.play('click'); pendingSoloStage = null; openSolo(); };
  $('btn-hyakki-fight').onclick = () => { AudioSys.play('click'); startBattle(); };
  $('btn-hyakki-continue').onclick = () => { AudioSys.play('click'); openHyakkiPreview(); };
  $('btn-hyakki-retry').onclick = () => {
    AudioSys.play('click');
    soloStreak = 0;
    openHyakkiPreview();
  };
  $('btn-hyakki-retire').onclick = () => {
    AudioSys.play('click');
    AudioSys.stopBgm();
    openSolo();
  };
  $('btn-hyakki-name').onclick = () => { AudioSys.play('click'); MenuUI.openProfile(); };
  /* プロフィール保存後に名前設定導線を消す(menu.tsが発火) */
  document.addEventListener('player-name-changed', () => renderHyakkiPanel());
  $('btn-ranking').onclick = () => {
    trackLandingEvent('hyakki_rank_view', { source: 'title' });
    AudioSys.play('click');
    openRanking('title');
  };
  $('btn-ranking-back').onclick = () => {
    AudioSys.play('click');
    if (rankingReturn === 'solo') openSolo();
    else enterTitle();
  };
  $('btn-online').onclick = () => {
    trackLandingEvent('online_cta_click', { source: 'title' });
    void openOnline();
  };
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
  $('btn-support-battle').onclick = () => { AudioSys.play('click'); SupportUI.open('対局中'); };
  $('btn-battle-status').onclick = ev => {
    ev.stopPropagation();
    AudioSys.play('click');
    const panel = $('battle-status-panel');
    const open = panel.classList.contains('hidden');
    setBattleStatusOpen(open);
  };
  document.addEventListener('click', ev => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (t.closest('.battle-status-wrap')) return;
    setBattleStatusOpen(false);
  });
  $('btn-close-rules').onclick = () => { AudioSys.play('click'); $('modal-rules').classList.add('hidden'); };
  $('btn-piece-detail-close').onclick = () => { AudioSys.play('click'); closePieceDetail(); };
  $('btn-piece-detail-zoom').onclick = () => {
    AudioSys.play('click');
    openPieceZoom($<HTMLImageElement>('piece-detail-img').src, $('piece-detail-name').textContent || '');
  };
  $('btn-piece-info-close').onclick = ev => {
    ev.stopPropagation();
    AudioSys.play('click');
    hideInfo();
  };
  /* 盤面外タップでも選択・利き・駒説明を外す（セル／持ち駒／操作ボタンは除外） */
  $('screen-battle').addEventListener('click', ev => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (t.closest('.cell, .hand-chip, #piece-info, .battle-tools, .btn-awaken, button, a, input, textarea, select')) return;
    clearBattleFocus();
  });
  const closeZoom = () => { AudioSys.play('click'); closePieceZoom(); };
  $('modal-piece-zoom').onclick = closeZoom;
  $('btn-piece-zoom-close').onclick = ev => { ev.stopPropagation(); closeZoom(); };
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    if (!$('modal-piece-zoom').classList.contains('hidden')) {
      closePieceZoom();
      return;
    }
    if (!$('modal-piece-detail').classList.contains('hidden')) {
      closePieceDetail();
      return;
    }
    if (!$('battle-status-panel').classList.contains('hidden')) {
      setBattleStatusOpen(false);
      return;
    }
    if (!$('piece-info').classList.contains('hidden')) hideInfo();
  });
  $('btn-pieces').onclick = () => {
    AudioSys.play('click');
    RegistrationStatsUI.stopPolling();
    MatchHourUI.stop();
    showScreen('screen-pieces');
    FX.setAmbient(['rgba(88,182,255,0.4)', 'rgba(200,120,255,0.4)', 'rgba(232,196,106,0.35)'], 0.04);
  };
  $('btn-pieces-back').onclick = () => { AudioSys.play('click'); enterTitle(); };
  $('btn-mute').onclick = () => {
    AudioSys.init();
    MenuUI.openAudioSettings();
  };
  $('btn-awaken').onclick = () => {
    if (!G || G.winner || busy || G.turn !== 'p' || !Game.awakenReady(G, 'p')) return;
    if (sel && sel.kind === 'awaken') { clearSel(); return; } // 再押下でキャンセル
    const targets = Game.awakenTargets(G, 'p');
    if (targets.length === 0) return;
    clearSel();
    /* 対象が1体だけなら即発動、複数なら対象選択モード */
    if (targets.length === 1) { doAction({ kind: 'awaken', to: targets[0] }); return; }
    sel = { kind: 'awaken', targets };
    AudioSys.play('select');
    for (const t of targets) cellEl(t.x, t.y).classList.add('hl-awaken');
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
  RegistrationStatsUI.stopPolling();
  MatchHourUI.stop();
  renderHyakkiLobby();
  showScreen('screen-solo');
  FX.setAmbient(['rgba(255,170,60,0.35)', 'rgba(200,120,255,0.4)', 'rgba(88,182,255,0.3)'], 0.04);
}

function openHyakkiPreview() {
  RegistrationStatsUI.stopPolling();
  MatchHourUI.stop();
  pendingSoloStage = soloBattleStage();
  activeSoloStage = pendingSoloStage;
  renderHyakkiPreview();
  showScreen('screen-hyakki-preview');
  FX.setAmbient(['rgba(255,170,60,0.4)', 'rgba(200,120,255,0.45)', 'rgba(88,182,255,0.25)'], 0.05);
}

function openRanking(from: 'title' | 'solo' = 'title') {
  rankingReturn = from;
  RegistrationStatsUI.stopPolling();
  MatchHourUI.stop();
  renderHyakkiPanel();
  showScreen('screen-ranking');
  FX.setAmbient(['rgba(200,120,255,0.45)', 'rgba(232,196,106,0.35)', 'rgba(88,182,255,0.25)'], 0.04);
}

function applyHyakkiStanding(p: { currentStreak: number; bestStreak: number; rank: number | null }) {
  soloStreak = p.currentStreak;
  soloBestStreak = Math.max(soloBestStreak, p.bestStreak);
  soloRank = p.rank;
}

function renderHyakkiLobby() {
  $('solo-current-streak').textContent = String(soloStreak);
  $('solo-best-streak').textContent = soloBestStreak > 0 ? String(soloBestStreak) : '—';
  $('solo-rank').textContent = soloRank ? `${soloRank}位` : '—';
  if (!Meta.online) return;
  Meta.hyakkiStatus().then(p => {
    if (!p) return;
    applyHyakkiStanding(p);
    $('solo-current-streak').textContent = String(soloStreak);
    $('solo-best-streak').textContent = soloBestStreak > 0 ? String(soloBestStreak) : '—';
    $('solo-rank').textContent = soloRank ? `${soloRank}位` : '—';
  }).catch(() => { /* オフライン表示のまま */ });
}

function renderHyakkiPreview() {
  const stage = pendingSoloStage || activeSoloStage;
  const boss = YOKAI[stage.bossId];
  $('hyakki-preview-round').textContent = `第 ${soloStreak + 1} 戦`;
  $<HTMLImageElement>('hyakki-preview-boss').src = boss.img;
  $<HTMLImageElement>('hyakki-preview-boss').alt = boss.name;
  $('hyakki-preview-boss-name').textContent = boss.name;
  const pieces = $('hyakki-preview-pieces');
  pieces.replaceChildren();
  for (const id of stage.enemyRows.flat().filter((x): x is string => !!x)) {
    const yokai = YOKAI[id];
    const img = document.createElement('img');
    img.src = yokai.imgSm;
    img.alt = yokai.name;
    img.title = yokai.name;
    pieces.appendChild(img);
  }
}

/* ---------- 百鬼夜行 週間連勝ランキング(doc 21) ---------- */

function hyakkiRankEligible(): boolean {
  return Meta.online;
}

function renderHyakkiReward() {
  const def = YOKAI[HYAKKI_REWARD_YOKAI_ID];
  const baseName = def.variantOf ? YOKAI[def.variantOf].name : def.name;
  const card = $('hyakki-reward');
  const img = $<HTMLImageElement>('hyakki-reward-img');
  img.src = def.img;
  img.alt = def.name;
  $('hyakki-reward-name').textContent = def.name;
  $('hyakki-reward-desc').textContent =
    `限定異装（性能は${baseName}と同じ）。月曜リセット後、先週1位へ自動授与。タップで詳細。`;
  if (def.summonColors) {
    card.style.setProperty('--reward-light', def.summonColors[0]);
    card.style.setProperty('--reward-primary', def.summonColors[1]);
  }
  card.onclick = () => { AudioSys.play('click'); openPieceDetail(HYAKKI_REWARD_YOKAI_ID); };
}

function renderHyakkiPanel() {
  renderHyakkiReward();
  const note = $('hyakki-ranking-note');
  note.textContent = '対象: 百鬼夜行の連戦';
  note.classList.remove('hidden');
  if (!Meta.online) {
    hyakkiRanking = null;
    renderHyakkiEntries('オンライン接続時にランキングを閲覧できます');
    return;
  }
  if (Date.now() - hyakkiRankingAt > 60_000) {
    hyakkiRankingAt = Date.now();
    Meta.hyakkiRanking().then(r => {
      if (r) { hyakkiRanking = r; renderHyakkiEntries(); }
    }).catch(() => { hyakkiRankingAt = 0; /* 次の表示で再取得 */ });
  }
  renderHyakkiEntries();
}

/* 同率同順位の順位番号(降順ソート済み前提) */
function hyakkiRankNumbers(entries: { bestStreak: number }[]): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    ranks.push(i > 0 && entries[i].bestStreak === entries[i - 1].bestStreak ? ranks[i - 1] : i + 1);
  }
  return ranks;
}

function hyakkiEntryLi(rank: number, name: string, bestStreak: number): HTMLLIElement {
  const li = document.createElement('li');
  const rankEl = document.createElement('span');
  rankEl.className = 'hyakki-rank';
  rankEl.textContent = `${rank}位`;
  const nameEl = document.createElement('span');
  nameEl.className = 'hyakki-name';
  nameEl.textContent = name;
  const streakEl = document.createElement('b');
  streakEl.textContent = `${bestStreak}連勝`;
  li.append(rankEl, nameEl, streakEl);
  return li;
}

function renderHyakkiEntries(emptyMessage = 'ランキングを読み込み中…') {
  const list = $('hyakki-ranking-list');
  const meEl = $('hyakki-ranking-me');
  list.replaceChildren();
  meEl.textContent = '';
  if (!hyakkiRanking) {
    meEl.textContent = emptyMessage;
    $('hyakki-lastweek').classList.add('hidden');
    $('btn-hyakki-name').classList.add('hidden');
    return;
  }

  const { top, lastWeek, me } = hyakkiRanking;
  if (top.length === 0) {
    meEl.textContent = 'まだ今週の記録がありません。最初の挑戦者になろう!';
  } else {
    const ranks = hyakkiRankNumbers(top);
    top.forEach((e, i) => list.appendChild(hyakkiEntryLi(ranks[i], e.name, e.bestStreak)));
    meEl.textContent = me
      ? `あなたの今週ベスト: ${me.bestStreak}連勝(${me.rank}位)`
      : 'あなたの今週の記録はまだありません';
  }

  const lastWrap = $('hyakki-lastweek');
  lastWrap.classList.toggle('hidden', lastWeek.length === 0);
  const lastList = $('hyakki-lastweek-list');
  lastList.replaceChildren();
  const lastRanks = hyakkiRankNumbers(lastWeek);
  lastWeek.forEach((e, i) => lastList.appendChild(hyakkiEntryLi(lastRanks[i], e.name, e.bestStreak)));

  /* 名前未設定(デフォルトのまま)ならランキング掲載前に設定を促す */
  $('btn-hyakki-name').classList.toggle('hidden', Meta.data.name !== 'プレイヤー');
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
  MatchHourUI.refresh();
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
  /* Promiseを返すことで OnlineConnection の直列キューが演出完了を待つ */
  online.onMessage = message => onOnlineMessage(message);
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
    if (entering) {
      /* 盤を描いてから VS→共鳴。await で後続イベントより先に開幕演出を完了させる */
      await startOnlineBattle();
    } else if (shouldRender) {
      renderAll();
      updateHUD();
    }
    onlineSeq = message.seq;
    busy = G.turn !== 'p';
    setOnlineConnection('接続済み');
    setOnlineTurnTimer(message.remainMs, message.phase);
  } else if (message.t === 'events') {
    if (!onlineSide) return;
    busy = true;
    for (const event of eventsForView(message.events, onlineSide)) await animEvent(event);
    renderAll();
    updateHUD();
    await announceResonances();
    onlineSeq = message.seq;
    if (G && !G.winner && G.reason !== 'draw') busy = G.turn !== 'p';
    renderOnlineTimers();
  } else if (message.t === 'your_turn') {
    setOnlineTurnTimer(message.remainMs, message.phase);
    if (G?.turn === 'p') { busy = false; showBanner('p'); }
  } else if (message.t === 'clock') {
    const enteredByoyomi = onlineClockPhase !== 'byoyomi' && message.phase === 'byoyomi';
    setOnlineTurnTimer(message.remainMs, message.phase);
    if (enteredByoyomi) {
      showByoyomiBanner();
      if (G?.turn === 'p') AudioSys.play('byoyomi');
    }
  } else if (message.t === 'opponent_disconnected') {
    setOpponentDisconnectTimer(message.graceMs);
  } else if (message.t === 'opponent_reconnected') {
    clearOpponentDisconnectTimer();
  } else if (message.t === 'game_end') {
    if (!G || !onlineSide) return;
    G.winner = message.winner === 'draw' ? null : (message.winner === onlineSide ? 'p' : 'e');
    onlineEndReason = message.reason;
    onlineReward = message.reward.tickets;
    onlineParticipation = message.reward.participation ?? 0;
    onlineEventYokai = message.reward.eventYokai ?? null;
    Meta.addTickets(message.reward.tickets + onlineParticipation);
    if (onlineEventYokai) Meta.addYokai(onlineEventYokai);
    clearOnlineMatch();
    stopOnlineTimer();
    await sleep(750); // 最終手のスキル演出後、ソロと同様に間を置いてからリザルトへ
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
  openHyakkiPreview();
}

function formatCountdown(ms: number, compact = false): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (compact) return String(seconds);
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
  onlineClockPhase = 'main';
  onlineTimerTickSec = -1;
  $('online-status').classList.remove('timer-warn', 'timer-low', 'timer-byoyomi', 'opponent-turn');
  $('screen-battle').classList.remove('timer-urgent');
  $('online-turn-hint').classList.add('hidden');
  $('online-turn-hint').textContent = '';
  clearOpponentDisconnectTimer();
}

function setOnlineTurnTimer(remainMs: number, phase: ClockPhase = 'main'): void {
  onlineTurnDeadline = Date.now() + Math.max(0, remainMs);
  onlineClockPhase = phase;
  onlineTimerTickSec = -1;
  ensureOnlineTimer();
}

function showByoyomiBanner(): void {
  const b = $('turn-banner');
  const own = G?.turn === 'p';
  b.className = '';
  b.replaceChildren();
  const label = document.createElement('span');
  label.className = 'byoyomi-banner-label';
  label.textContent = own ? '秒読み！' : '相手の秒読み！';
  const msg = document.createElement('span');
  msg.className = 'byoyomi-banner-msg';
  msg.textContent = own ? '切れたら負け' : '切れれば勝ち';
  b.append(label, msg);
  void b.offsetWidth;
  b.classList.add('show-byoyomi');
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
  const byoyomi = onlineClockPhase === 'byoyomi';
  const warn = !byoyomi && turnRemain > 0 && turnRemain <= ONLINE_TIMER_WARN_MS;
  const low = byoyomi || (turnRemain > 0 && turnRemain <= ONLINE_TIMER_LOW_MS);
  const spanMs = byoyomi ? ONLINE_BYOYOMI_MS : ONLINE_TURN_MS;
  const compact = byoyomi || turnRemain <= ONLINE_TIMER_WARN_MS;

  $('online-turn-label').textContent = byoyomi
    ? (ownTurn ? '秒読み' : '相手の秒読み')
    : (ownTurn ? 'あなたの手番' : '相手の手番');
  $('online-turn-time').textContent = formatCountdown(turnRemain, compact);
  $('online-turn-fill').style.width = `${Math.min(100, (turnRemain / spanMs) * 100)}%`;
  const hint = $('online-turn-hint');
  hint.textContent = byoyomi ? (ownTurn ? '切れたら負け' : '切れれば勝ち') : '';
  hint.classList.toggle('hidden', !byoyomi);

  const status = $('online-status');
  status.classList.toggle('opponent-turn', !ownTurn);
  status.classList.toggle('timer-warn', warn);
  status.classList.toggle('timer-low', low);
  status.classList.toggle('timer-byoyomi', byoyomi);
  $('screen-battle').classList.toggle('timer-urgent', ownTurn && low);

  if (ownTurn && low) {
    const sec = Math.max(0, Math.ceil(turnRemain / 1000));
    if (sec !== onlineTimerTickSec && sec > 0 && sec <= 10) {
      onlineTimerTickSec = sec;
      AudioSys.play('tick');
    } else if (sec !== onlineTimerTickSec) {
      onlineTimerTickSec = sec;
    }
  } else {
    onlineTimerTickSec = -1;
  }

  if (onlineDisconnectDeadline > 0) {
    const graceRemain = Math.max(0, onlineDisconnectDeadline - now);
    $('online-disconnect-time').textContent = formatCountdown(graceRemain);
    $('online-disconnect-fill').style.width = `${Math.min(100, graceRemain / ONLINE_DISCONNECT_MS * 100)}%`;
  }
}

async function startOnlineBattle() {
  trackLandingEvent('online_battle_start');
  busy = true; // 開幕演出中は入力・後続イベント演出をロック
  sel = null;
  pieceEls.forEach(el => el.remove());
  pieceEls.clear();
  hideInfo();
  clearSel();
  setBattleStatusOpen(false);
  showScreen('screen-battle');
  const boss = YOKAI[Meta.bossId()];
  $<HTMLImageElement>('player-avatar').src = boss.img;
  $('player-name').textContent = Meta.data.name;
  $<HTMLImageElement>('enemy-avatar').src = YOKAI[onlineMatch?.opponentBossId || ENEMY_BOSS].img;
  $('enemy-hud').querySelector('.hud-name')!.lastChild!.textContent = onlineMatch?.opponentName || '対戦相手';
  $('online-status').classList.remove('hidden');
  $('hyakki-round-hud').classList.add('hidden');
  setOnlineConnection('接続済み');
  ensureOnlineTimer();
  FX.setAmbient(['rgba(255,170,60,0.35)', 'rgba(130,160,255,0.3)'], 0.025);
  AudioSys.init();
  AudioSys.startBattleBgm();
  summonAnnounced.clear();
  resonanceAnnounced.clear();
  renderAll();
  updateHUD();
  /* ソロと同様に VS → 共鳴の順。await しないと共鳴カットインが VS に被る */
  await playVsIntro(
    { bossId: onlineMatch?.opponentBossId || ENEMY_BOSS, label: onlineMatch?.opponentName || '対戦相手' },
    'オンライン対戦',
  );
  await announceResonances();
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
      bindLongPress(c, () => {
        const pc = G?.board[y][x];
        if (!pc) return;
        showInfo(pc.id, pc.promoted);
      });
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
    + (YOKAI[pc.id].boss ? ' boss-piece' : '')
    + (YOKAI[pc.id].variantOf ? ' special-piece' : '')
    + (YOKAI[pc.id].rarity === 'SSR' && !YOKAI[pc.id].variantOf ? ' ssr-piece' : '')
    + (YOKAI[pc.id].skill.kind === 'moon' ? ' moon-piece' : '');
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

/* 移動時の残像(color指定でSSR・異装用の発光残像) */
function spawnGhost(el: HTMLElement, x: number, y: number, color?: string) {
  const img = el.querySelector('img');
  if (!img) return;
  const g = document.createElement('div');
  g.className = 'piece-ghost';
  if (color) {
    g.classList.add('ghost-special');
    g.style.setProperty('--ghost-c', color);
  }
  g.appendChild(img.cloneNode() as HTMLElement);
  positionPiece(g, x, y);
  $('board-pieces').appendChild(g);
  setTimeout(() => g.remove(), color ? 520 : 420);
}

function setPromoted(el: HTMLElement) {
  if (el.classList.contains('promoted')) return;
  el.classList.add('promoted');
  const b = document.createElement('div');
  b.className = 'promo-badge';
  b.textContent = '成';
  el.appendChild(b);
}

function setHydraBadge(el: HTMLElement, pc: { id: string; hydra?: number }) {
  const sk = YOKAI[pc.id].skill;
  el.querySelector('.hydra-badge')?.remove();
  if (sk.kind !== 'hydra') return;
  const heads = (pc.hydra ?? sk.extra) + 1;
  const b = document.createElement('div');
  b.className = 'hydra-badge';
  b.textContent = String(heads);
  b.title = `残り${heads}首`;
  el.appendChild(b);
}

/* 状態とDOMを同期 */
function renderAll() {
  const seen = new Set<number>();
  /* 因縁共鳴中の駒uid(両者が盤上に揃っているペア) */
  const resonating = new Set<number>();
  for (const side of ['p', 'e'] as const) {
    for (const rs of RESONANCES) {
      const members = G!.board.flat().filter(
        (pc): pc is NonNullable<typeof pc> => !!pc && pc.owner === side && rs.pair.includes(baseIdOf(pc.id)));
      if (new Set(members.map(pc => baseIdOf(pc.id))).size === 2) {
        members.forEach(pc => resonating.add(pc.uid));
      }
    }
  }
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const pc = G!.board[y][x];
      if (!pc) continue;
      seen.add(pc.uid);
      const el = pieceEls.get(pc.uid) || makePieceEl(pc);
      positionPiece(el, x, y);
      if (pc.promoted) setPromoted(el);
      el.classList.toggle('awakened', Game.isAwakened(pc, G!.plies ?? 0));
      el.classList.toggle('enraged', pc.enraged === true);
      el.classList.toggle('resonating', resonating.has(pc.uid));
      el.classList.toggle('owner-p', pc.owner === 'p');
      el.classList.toggle('owner-e', pc.owner === 'e');
      setHydraBadge(el, pc);
    }
  }
  for (const [uid, el] of pieceEls) {
    if (!seen.has(uid)) { el.remove(); pieceEls.delete(uid); }
  }
  renderEmbers();
}

function renderEmbers() {
  document.querySelectorAll('.ember-mark').forEach(el => el.remove());
  if (!G?.embers) return;
  for (const e of G.embers) {
    if (e.until < (G.plies ?? 0)) continue;
    const mark = document.createElement('div');
    mark.className = `ember-mark ember-${e.mode} ember-side-${e.side}`;
    mark.title = e.mode === 'atk' ? `残火 +${e.value}` : e.mode === 'heal' ? `燐火 +${e.value}` : `落とし穴 ${e.value}`;
    cellEl(e.x, e.y).appendChild(mark);
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
  updateMoonHUD();
  updateAwakenHUD();
  updateHungerHUD();
}

function setBattleStatusOpen(open: boolean) {
  $('battle-status-panel').classList.toggle('hidden', !open);
  $('btn-battle-status').setAttribute('aria-expanded', open ? 'true' : 'false');
}

function moonSkillInvolved(): boolean {
  if (!G) return false;
  return G.board.flat().some(pc => pc && YOKAI[pc.id].skill.kind === 'moon')
    || (['p', 'e'] as const).some(side => Object.keys(G!.hands[side]).some(id => YOKAI[id].skill.kind === 'moon'));
}

function updateBattleStatusBadge() {
  const badge = $('battle-status-badge');
  if (!G) { badge.classList.add('hidden'); return; }
  const hunger = Game.hungerActive(G);
  const full = moonSkillInvolved() && Game.moonPhase(G) === MOON_CYCLE - 1;
  badge.classList.toggle('hidden', !(hunger || full));
  badge.classList.toggle('alert-moon', full && !hunger);
}

function updateHungerHUD() {
  const hud = $('hunger-hud');
  if (!G) { hud.classList.add('hidden'); updateBattleStatusBadge(); return; }
  hud.classList.remove('hidden');
  const active = Game.hungerActive(G);
  hud.classList.toggle('hunger-active', active);
  if (active) {
    $('hunger-label').textContent = `飢餓の夜 -${HUNGER_DRAIN}`;
  } else {
    const left = Game.hungerTurnsLeft(G);
    $('hunger-label').textContent = left === 0 ? '飢餓まであと0' : `飢餓まであと${left}`;
  }
  updateBattleStatusBadge();
}

/* 月齢表示: moonスキル持ちが対局に絡む時だけパネルに出す。満月は盤ごと月光に染める */
const MOON_ICONS = ['🌑', '🌓', '🌔', '🌕'] as const;
function updateMoonHUD() {
  const hud = $('moon-hud');
  const involved = moonSkillInvolved();
  hud.classList.toggle('hidden', !involved);
  const full = involved && Game.moonPhase(G!) === MOON_CYCLE - 1;
  $('board-frame').classList.toggle('moonlit', full);
  if (involved) {
    const phase = Game.moonPhase(G!);
    $('moon-icon').textContent = MOON_ICONS[phase] ?? MOON_ICONS[0];
    const nights = Game.nightsUntilFullMoon(G!);
    $('moon-label').textContent = full ? '満月 ― 会心確定!' : `${MOON_PHASES[phase]}(満月まで${nights}夜)`;
  }
  hud.classList.toggle('full-moon', full);
  updateBattleStatusBadge();
}

/* 覚醒ゲージ: 取り合いで両陣営に溜まる。自分は満タンでボタン点灯 */
function updateAwakenHUD() {
  for (const side of ['p', 'e'] as const) {
    const st = G!.awaken?.[side] ?? { gauge: 0, used: false };
    const pips = $(`${side === 'p' ? 'player' : 'enemy'}-awaken-pips`);
    pips.innerHTML = '';
    for (let i = 0; i < AWAKEN_MAX; i++) {
      const pip = document.createElement('span');
      pip.className = 'awaken-pip' + (st.used ? ' pip-used' : i < st.gauge ? ' pip-filled' : '');
      pips.appendChild(pip);
    }
    $(`${side === 'p' ? 'player' : 'enemy'}-awaken-row`).classList.toggle('awaken-used', st.used);
  }
  const btn = $('btn-awaken');
  const ready = Game.awakenReady(G!, 'p') && Game.awakenTargets(G!, 'p').length > 0 && !G!.winner;
  btn.classList.toggle('hidden', !ready);
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
    bindLongPress(chip, () => showInfo(id, false));
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
  updateComboHeat();
}

/* コンボ段階に応じて画面全体を加熱する(縁のビネット+漂う魂火の増量)。
   コンボが切れると静かな基本状態に戻る */
const AMBIENT_BASE: [string, string] = ['rgba(255,170,60,0.35)', 'rgba(130,160,255,0.3)'];
function updateComboHeat() {
  const el = $('combo-vignette');
  if (!G || !$('screen-battle').classList.contains('active')) { el.className = ''; return; }
  const p = G.combo.p, e = G.combo.e;
  const n = Math.max(p, e);
  const side: Side = p >= e ? 'p' : 'e';
  const flame = side === 'p' ? 'rgba(140,200,255,0.6)' : 'rgba(255,120,110,0.6)';
  if (n >= 4) {
    el.className = `lv2 side-${side}`;
    FX.setAmbient([...AMBIENT_BASE, flame, 'rgba(255,215,120,0.55)'], 0.16);
  } else if (n >= 3) {
    el.className = `lv1 side-${side}`;
    FX.setAmbient([...AMBIENT_BASE, flame], 0.08);
  } else {
    el.className = '';
    FX.setAmbient(AMBIENT_BASE, 0.025);
  }
}

/* ---------- 駒情報パネル（長押しで表示） ---------- */
const LONG_PRESS_MS = 480;
const LONG_PRESS_MOVE_PX = 14;

function showInfo(id: string, promoted: boolean) {
  const def = YOKAI[id];
  $('piece-info').classList.remove('hidden');
  $<HTMLImageElement>('info-img').src = def.imgSm;
  const typeEl = $('info-type');
  if (def.boss) {
    typeEl.hidden = false;
    typeEl.textContent = '大将';
    typeEl.className = 'type-chip t-boss';
  } else {
    typeEl.hidden = true;
    typeEl.textContent = '';
    typeEl.className = 'type-chip';
  }
  $('info-name').textContent = def.name + (promoted ? '【成】' : '');
  $('info-atk').textContent = `ATK ${promoted ? Math.round(def.atk * 1.5) : def.atk}`;
  $('info-move').textContent = def.moveText;
  $('info-skill-name').textContent = `【${def.skill.name}】`;
  $('info-skill-desc').textContent = def.skill.desc;
  AudioSys.play('select');
}
function hideInfo() { $('piece-info').classList.add('hidden'); }

/** 長押し検知。発火後の click は抑止して着手と分離する */
function bindLongPress(el: HTMLElement, onLongPress: () => void) {
  let timer: number | null = null;
  let startX = 0;
  let startY = 0;
  let fired = false;

  const clearTimer = () => {
    if (timer == null) return;
    clearTimeout(timer);
    timer = null;
  };

  el.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    fired = false;
    startX = ev.clientX;
    startY = ev.clientY;
    clearTimer();
    timer = window.setTimeout(() => {
      timer = null;
      fired = true;
      onLongPress();
    }, LONG_PRESS_MS);
  });
  el.addEventListener('pointermove', ev => {
    if (timer == null) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) clearTimer();
  });
  el.addEventListener('pointerup', clearTimer);
  el.addEventListener('pointercancel', clearTimer);
  el.addEventListener('click', ev => {
    if (!fired) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    fired = false;
  }, true);
  el.addEventListener('contextmenu', ev => {
    if (fired || timer != null) ev.preventDefault();
  });
}

/* ============================== 入力 ============================== */
const HL_CLASSES = [
  'hl-move', 'hl-capture', 'hl-drop', 'hl-selected', 'hl-awaken', 'hl-phase',
  'hl-enemy-move', 'hl-enemy-capture', 'hl-enemy-selected',
] as const;

function clearSel() {
  sel = null;
  document.querySelectorAll('.cell').forEach(c => c.classList.remove(...HL_CLASSES));
  if (G) renderHand('p');
}

/** 選択ハイライト・敵利き・駒説明をまとめて外す */
function clearBattleFocus() {
  if (!G) return;
  clearSel();
  hideInfo();
}

/** 敵駒の移動・攻撃範囲を盤上にプレビュー（着手はしない） */
function showEnemyRange(x: number, y: number) {
  if (!G) return;
  clearSel();
  const moves = Game.getMoves(G, x, y);
  AudioSys.play('select');
  cellEl(x, y).classList.add('hl-enemy-selected');
  for (const m of moves) {
    cellEl(m.x, m.y).classList.add(m.capture ? 'hl-enemy-capture' : 'hl-enemy-move');
  }
}

function beginPhaseSelect(from: Pos, to: Pos) {
  if (!G) return;
  const pc = G.board[from.y][from.x];
  if (!pc) return;
  const kind = YOKAI[pc.id].skill.kind;
  if (kind !== 'phase' && kind !== 'veil') return;
  const options = Game.escapeDests(G, from, to, kind);
  /* 残留(to)も選択可 */
  const all = [{ ...to }, ...options];
  clearSel();
  sel = { kind: 'phase', from, to, options: all };
  AudioSys.play('select');
  cellEl(to.x, to.y).classList.add('hl-selected');
  for (const p of all) cellEl(p.x, p.y).classList.add('hl-phase');
}

function beginSpawnSelect(from: Pos, to: Pos) {
  if (!G) return;
  const options = Game.spawnDests(G, from, to);
  if (options.length === 0) {
    doAction({ kind: 'move', from, to });
    return;
  }
  clearSel();
  sel = { kind: 'spawn', from, to, options };
  AudioSys.play('select');
  cellEl(to.x, to.y).classList.add('hl-selected');
  for (const p of options) cellEl(p.x, p.y).classList.add('hl-drop');
}

function beginDualSelect(from: Pos, to: Pos) {
  if (!G) return;
  const options = Game.dualDests(G, to, 'p');
  if (options.length === 0) {
    doAction({ kind: 'move', from, to });
    return;
  }
  clearSel();
  sel = { kind: 'dual', from, to, options };
  AudioSys.play('select');
  cellEl(to.x, to.y).classList.add('hl-selected', 'hl-phase');
  for (const p of options) cellEl(p.x, p.y).classList.add('hl-capture');
}

function onCellClick(x: number, y: number) {
  if (!G) return;

  const pc = G.board[y][x];
  const canAct = !G.winner && !busy && G.turn === 'p';

  /* 移動先 / 打ち先 / 覚醒対象として有効か */
  if (canAct && sel) {
    if (sel.kind === 'phase') {
      const opt = sel.options.find(p => p.x === x && p.y === y);
      if (opt) {
        const stay = opt.x === sel.to.x && opt.y === sel.to.y;
        doAction(stay
          ? { kind: 'move', from: sel.from, to: sel.to }
          : { kind: 'move', from: sel.from, to: sel.to, phaseTo: opt });
        return;
      }
      clearBattleFocus();
      return;
    }
    if (sel.kind === 'spawn') {
      const opt = sel.options.find(p => p.x === x && p.y === y);
      if (opt) {
        const behind = opt.x === sel.from.x && opt.y === sel.from.y;
        doAction(behind
          ? { kind: 'move', from: sel.from, to: sel.to }
          : { kind: 'move', from: sel.from, to: sel.to, spawnTo: opt });
        return;
      }
      clearBattleFocus();
      return;
    }
    if (sel.kind === 'dual') {
      if (x === sel.to.x && y === sel.to.y) {
        doAction({ kind: 'move', from: sel.from, to: sel.to });
        return;
      }
      const opt = sel.options.find(p => p.x === x && p.y === y);
      if (opt) {
        doAction({ kind: 'move', from: sel.from, to: sel.to, dualTo: opt });
        return;
      }
      clearBattleFocus();
      return;
    }
    if (sel.kind === 'piece') {
      const { x: sx, y: sy } = sel;
      const m = sel.moves.find(m => m.x === x && m.y === y);
      if (m) {
        const attacker = G.board[sy][sx];
        const sk = attacker ? YOKAI[attacker.id].skill.kind : '';
        if (m.capture && (sk === 'phase' || sk === 'veil')) {
          beginPhaseSelect({ x: sx, y: sy }, { x, y });
          return;
        }
        if (m.capture && sk === 'spawn') {
          beginSpawnSelect({ x: sx, y: sy }, { x, y });
          return;
        }
        if (m.capture && sk === 'dual') {
          beginDualSelect({ x: sx, y: sy }, { x, y });
          return;
        }
        doAction({ kind: 'move', from: { x: sx, y: sy }, to: { x, y } });
        return;
      }
    } else if (sel.kind === 'hand') {
      const id = sel.id;
      const d = sel.drops.find(d => d.x === x && d.y === y);
      if (d) { doAction({ kind: 'drop', id, to: { x, y } }); return; }
    } else if (sel.kind === 'awaken') {
      const t = sel.targets.find(t => t.x === x && t.y === y);
      if (t) { doAction({ kind: 'awaken', to: { x, y } }); return; }
    }
  }

  /* 敵駒: 手番外・演出中でも利きを確認できる */
  if (pc && pc.owner !== 'p') {
    showEnemyRange(x, y);
    return;
  }

  if (!pc) {
    clearBattleFocus();
    return;
  }

  if (!canAct) return;

  clearSel();
  const moves = Game.getMoves(G, x, y);
  if (moves.length === 0) return;
  sel = { kind: 'piece', x, y, moves };
  AudioSys.play('select');
  cellEl(x, y).classList.add('hl-selected');
  for (const m of moves) cellEl(m.x, m.y).classList.add(m.capture ? 'hl-capture' : 'hl-move');
}

function onHandClick(id: string) {
  if (!G) return;
  if (G.winner || busy || G.turn !== 'p') return;
  if (sel && sel.kind === 'hand' && sel.id === id) { clearSel(); return; }
  clearSel();
  const drops = Game.getDrops(G, 'p', id);
  if (drops.length === 0) return;
  sel = { kind: 'hand', id, drops };
  AudioSys.play('select');
  renderHand('p');
  for (const d of drops) cellEl(d.x, d.y).classList.add('hl-drop');
}

/* ============================== 対局進行 ============================== */
/* SSR・異装を打った時の初見参演出(1対局につき駒種ごとに1回) */
const summonAnnounced = new Set<string>();

/* 因縁共鳴の成立アナウンス(1対局につき陣営×ペアごとに1回) */
const resonanceAnnounced = new Set<string>();
async function announceResonances() {
  if (!G || G.winner) return;
  for (const side of ['p', 'e'] as const) {
    for (const rs of RESONANCES) {
      const members = G.board.flat().filter(
        (pc): pc is NonNullable<typeof pc> => !!pc && pc.owner === side && rs.pair.includes(baseIdOf(pc.id)));
      if (new Set(members.map(pc => baseIdOf(pc.id))).size < 2) continue;
      const key = `${side}:${rs.name}`;
      if (resonanceAnnounced.has(key)) continue;
      resonanceAnnounced.add(key);
      const lead = members[0];
      AudioSys.play('summon');
      FX.flash(`color-mix(in srgb, ${rs.colors[1]} 30%, transparent)`, 240);
      await FX.cutin(YOKAI[lead.id].img, `共鳴【${rs.name}】`, rs.desc, 'summon', [...rs.colors], 3);
      for (const pc of members) {
        const el = pieceEls.get(pc.uid);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        FX.ring(rect.left + rect.width / 2, rect.top + rect.height / 2, rs.colors[1], 16, 70);
      }
    }
  }
}

async function summonCutin(id: string, at?: Pos) {
  const colors = specialFxColors(id);
  if (!colors || summonAnnounced.has(id)) return;
  summonAnnounced.add(id);
  const def = YOKAI[id];
  FX.flash(`color-mix(in srgb, ${colors[1]} 45%, transparent)`, 260);
  await FX.cutin(def.img, def.name, def.summonTitle || 'SSR妖怪 見参', 'summon', colors);
  if (at) {
    const c = cellCenter(at.x, at.y);
    AudioSys.play('bighit');
    FX.burst(c.x, c.y, [...colors], 60, 8.5);
    FX.ring(c.x, c.y, colors[1], 20, 90);
    FX.shockwave(c.x, c.y, colors[1], 16);
    FX.flash(`color-mix(in srgb, ${colors[0]} 30%, transparent)`, 200);
    await sleep(480);
  }
}

/* ---------- 開幕VS演出 ---------- */
/* 両大将が斜め分割の構図で見得を切り、「開戦」の帯とともに盤面へ。
   タイミング(0.55s=VS着地 / 1.62s=開戦の帯)はCSSアニメの遅延と同期 */
async function playVsIntro(enemy: { bossId: string; label: string }, stageLabel: string) {
  const root = $('vs-intro');
  const boss = YOKAI[Meta.bossId()];
  $<HTMLImageElement>('vs-img-p').src = boss.img;
  $<HTMLImageElement>('vs-img-p').alt = boss.name;
  $('vs-label-p').textContent = Meta.data.name;
  $<HTMLImageElement>('vs-img-e').src = YOKAI[enemy.bossId].img;
  $<HTMLImageElement>('vs-img-e').alt = YOKAI[enemy.bossId].name;
  $('vs-label-e').textContent = enemy.label;
  $('vs-stage').textContent = stageLabel;
  root.classList.remove('hidden', 'vs-out');
  // 再戦時にアニメを再始動
  root.querySelectorAll('.vs-bg, .vs-side, .vs-emblem, .vs-stage, .vs-kaisen, .vs-flash').forEach(el => {
    (el as HTMLElement).style.animation = 'none';
    void (el as HTMLElement).offsetWidth;
    (el as HTMLElement).style.animation = '';
  });
  AudioSys.play('summon');
  const t1 = setTimeout(() => AudioSys.play('bighit'), 580);   // VS着地
  const t2 = setTimeout(() => AudioSys.play('capture'), 1640); // 開戦の帯
  await sleep(2500);
  clearTimeout(t1); clearTimeout(t2);
  root.classList.add('vs-out');
  await sleep(400);
  root.classList.add('hidden');
}

async function startBattle() {
  trackLandingEvent('solo_battle_start', {
    mode: 'streak',
    stage: 'hyakki',
    difficulty: HYAKKI_RANK_DIFFICULTY,
  });
  const stage = pendingSoloStage || soloBattleStage();
  pendingSoloStage = null;
  activeSoloStage = stage;
  soloWinCounted = false;
  if (hyakkiRankEligible()) {
    /* 開始申告(doc 21)。サーバーが正本の連勝数を返す(リロード後の継続もここで復元)。
       失敗してもローカル表示で対局は続行 */
    Meta.hyakkiStart().then(p => {
      if (!p) return;
      applyHyakkiStanding(p);
      $('hyakki-round-label').textContent = `${soloStreak + 1}戦目`;
    }).catch(() => {});
  }
  onlineSide = null;
  onlineEndReason = null;
  onlineReward = 0;
  onlineParticipation = 0;
  onlineEventYokai = null;
  stopOnlineTimer();
  $('online-status').classList.add('hidden');
  G = Game.newState(Meta.formationRows(), stage.enemyRows);
  busy = true; // 開幕演出中は入力ロック
  sel = null;
  pieceEls.forEach(el => el.remove());
  pieceEls.clear();
  hideInfo();
  clearSel();
  setBattleStatusOpen(false);
  document.querySelectorAll('.cell').forEach(c => c.classList.remove('hl-last'));
  showScreen('screen-battle');
  const boss = YOKAI[Meta.bossId()];
  $<HTMLImageElement>('player-avatar').src = boss.img;
  $('player-name').textContent = Meta.data.name;
  $<HTMLImageElement>('enemy-avatar').src = YOKAI[stage.bossId].img;
  $('enemy-name').textContent = YOKAI[stage.bossId].name;
  $('hyakki-round-hud').classList.remove('hidden');
  $('hyakki-round-label').textContent = `${soloStreak + 1}戦目`;
  renderAll();
  updateHUD();
  FX.setAmbient(['rgba(255,170,60,0.35)', 'rgba(130,160,255,0.3)'], 0.025);
  AudioSys.init();
  AudioSys.startBattleBgm();
  summonAnnounced.clear();
  resonanceAnnounced.clear();
  await playVsIntro(
    { bossId: stage.bossId, label: '敵将' },
    `百鬼夜行 ${soloStreak + 1}戦目`,
  );
  await announceResonances(); // 開幕から因縁ペアが揃っている場合
  showBanner('p');
  busy = false;
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
  for (const ev of events) await animEvent(ev);

  renderAll();
  updateHUD();
  await announceResonances(); // 打ち込みで因縁ペアが揃った場合
  cellEl(action.to.x, action.to.y).classList.add('hl-last');

  if (G!.winner || G!.reason === 'draw') { await sleep(750); showResult(); return; }

  if (G!.turn === 'e') {
    showBanner('e');
    $('thinking').classList.remove('hidden');
    await sleep(40);
    const started = performance.now();
    const act = AI.chooseAction(G!, HYAKKI_RANK_DIFFICULTY);
    const leftover = 420 + Math.random() * 180 - (performance.now() - started);
    if (leftover > 0) await sleep(leftover);
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

/* SSR・異装の移動:溜め→残像疾走→着地衝撃 */
async function playSpecialMove(el: HTMLElement, fromPos: Pos, toPos: Pos, colors: string[]) {
  const from = cellCenter(fromPos.x, fromPos.y);
  const to = cellCenter(toPos.x, toPos.y);
  el.style.setProperty('--special-primary', colors[1]);
  /* 溜め:光を吸い込みながら身をかがめる */
  el.classList.add('charging');
  FX.converge(from.x, from.y, colors[1], 20, 64);
  await sleep(180);
  el.classList.remove('charging');
  /* 疾走:多段残像+火花の奔流 */
  el.classList.add('moving');
  positionPiece(el, toPos.x, toPos.y);
  AudioSys.play('move');
  FX.trail(from.x, from.y, to.x, to.y, colors, true);
  spawnGhost(el, fromPos.x, fromPos.y, colors[1]);
  for (let i = 1; i <= 2; i++) {
    const t = i / 3;
    setTimeout(() => spawnGhost(el,
      fromPos.x + (toPos.x - fromPos.x) * t,
      fromPos.y + (toPos.y - fromPos.y) * t, colors[1]), i * 75);
  }
  await sleep(290);
  el.classList.remove('moving');
  /* 着地:専用色の衝撃 */
  el.classList.add('landed');
  AudioSys.play('bighit');
  FX.burst(to.x, to.y, colors, 44, 7);
  FX.ring(to.x, to.y, colors[1], 22, 90);
  FX.shockwave(to.x, to.y, colors[1], 12);
  setTimeout(() => el.classList.remove('landed'), 260);
  await sleep(120);
}

/* ---------- イベント演出 ---------- */
async function animEvent(ev: GameEvent) {
  switch (ev.t) {
    case 'move': {
      const el = pieceEls.get(ev.uid);
      if (el) {
        const movedPc = G!.board[ev.to.y][ev.to.x] ?? G!.board[ev.from.y][ev.from.x];
        const special = movedPc ? specialFxColors(movedPc.id) : null;
        if (special) {
          await playSpecialMove(el, ev.from, ev.to, [...special]);
          break;
        }
        const from = cellCenter(ev.from.x, ev.from.y);
        const to = cellCenter(ev.to.x, ev.to.y);
        const isPlayer = el.classList.contains('owner-p');
        spawnGhost(el, ev.from.x, ev.from.y);
        FX.trail(from.x, from.y, to.x, to.y,
          isPlayer ? ['rgba(140,190,255,0.85)', 'rgba(200,230,255,0.7)'] : ['rgba(255,130,120,0.85)', 'rgba(255,200,180,0.7)']);
        el.classList.add('moving');
        positionPiece(el, ev.to.x, ev.to.y);
        AudioSys.play('move');
        await sleep(290);
        el.classList.remove('moving');
        el.classList.add('landed');
        FX.shockwave(to.x, to.y,
          isPlayer ? 'rgba(150,195,255,0.55)' : 'rgba(255,140,130,0.55)', 3.5);
        setTimeout(() => el.classList.remove('landed'), 260);
      }
      break;
    }
    case 'drop': {
      const pc = G!.board[ev.to.y][ev.to.x]!;
      await summonCutin(pc.id, ev.to); // SSR・異装は初回のみ見参カットイン
      const el = makePieceEl(pc);
      positionPiece(el, ev.to.x, ev.to.y);
      el.classList.add('dropping');
      AudioSys.play('drop');
      const c = cellCenter(ev.to.x, ev.to.y);
      const special = specialFxColors(pc.id);
      FX.ring(c.x, c.y,
        special ? special[1] : ev.owner === 'p' ? 'rgba(140,190,255,0.9)' : 'rgba(255,120,120,0.9)',
        special ? 22 : 14, special ? 70 : 46);
      if (special) FX.burst(c.x, c.y, [...special], 26, 5);
      await sleep(380);
      el.classList.remove('dropping');
      renderHand(ev.owner);
      break;
    }
    case 'capture': await animCapture(ev); break;
    case 'awaken': {
      const def = YOKAI[ev.id];
      const colors = specialFxColors(ev.id) ?? [...SSR_FX_COLORS];
      const c = cellCenter(ev.to.x, ev.to.y);
      const el = pieceEls.get(ev.uid);
      /* タメ: 暗転して力を吸い込む → 必殺技名のカットイン → 解放 */
      FX.spotlight(c.x, c.y, colors[1], 2200);
      FX.converge(c.x, c.y, colors[1], 26, 110);
      el?.classList.add('awakening');
      await sleep(420);
      AudioSys.play('summon');
      await FX.cutin(def.img, `覚醒【${ev.name}】`, `${def.name} ― 魂力解放 ATK×${AWAKEN_ATK}`, 'summon', colors, 3);
      AudioSys.play('bighit');
      FX.flash(`color-mix(in srgb, ${colors[0]} 40%, transparent)`, 260);
      FX.pillar(c.x, c.y, colors);
      setTimeout(() => FX.pillar(c.x, c.y, colors), 150);
      FX.burst(c.x, c.y, [...colors], 52, 8);
      FX.ring(c.x, c.y, colors[1], 22, 110);
      FX.shockwave(c.x, c.y, colors[1], 14);
      FX.kanjiStamp(c.x, c.y - 12, '覚');
      FX.shake(true);
      if (el) {
        el.classList.remove('awakening');
        el.classList.add('awakened', 'promoted-burst');
        setTimeout(() => el.classList.remove('promoted-burst'), 520);
      }
      if (ev.owner === 'p') Records.bump(ev.name);
      await sleep(650);
      break;
    }
    case 'promote': {
      const c = cellCenter(ev.to.x, ev.to.y);
      const pc = G!.board[ev.to.y][ev.to.x];
      const el = pieceEls.get(ev.uid);
      const special = pc ? specialFxColors(pc.id) : null;
      /* タメ: 周囲を落として金の光を吸い込みながら白熱 */
      FX.spotlight(c.x, c.y, '#ffd24a', special ? 2600 : 1300);
      FX.converge(c.x, c.y, '#ffd24a', 24, 84);
      el?.classList.add('awakening');
      await sleep(360);
      /* SSR・異装は覚醒カットインを挟む */
      if (special && pc) {
        const def = YOKAI[pc.id];
        await FX.cutin(def.img, `${def.name}【成】`, '覚醒 ― 真の力、解放', 'summon', special, 3);
      }
      /* 金屏風の帯が横一閃 → 閃光とともに覚醒 */
      FX.promoteBand(c.y);
      await sleep(220);
      AudioSys.play('promote');
      FX.flash('rgba(255, 230, 160, 0.55)', 220);
      FX.pillar(c.x, c.y);
      setTimeout(() => FX.pillar(c.x, c.y), 140);
      FX.ring(c.x, c.y, '#ffd24a', 20, 95);
      FX.burst(c.x, c.y, ['#fff6d8', '#ffd24a', '#ffe9a0', '#f0a830'], 34, 7);
      FX.shockwave(c.x, c.y, '#ffd24a', 11);
      FX.kanjiStamp(c.x, c.y - 12, '成');
      if (el) {
        el.classList.remove('awakening');
        setPromoted(el);
        el.classList.add('promoted-burst');
        setTimeout(() => el.classList.remove('promoted-burst'), 520);
      }
      await sleep(700);
      break;
    }
    case 'hunger': {
      AudioSys.play('hit');
      FX.flash('rgba(40, 20, 60, 0.35)', 220);
      updateHUD();
      await sleep(280);
      break;
    }
    case 'gameover': break; // doAction側で処理
  }
}

async function animCapture(ev: CaptureEvent) {
  const c = cellCenter(ev.at.x, ev.at.y);
  const isPlayer = ev.attacker.owner === 'p';
  const special = specialFxColors(ev.attacker.id);
  const colors = special ? [...special] : isPlayer ? COLORS_P : COLORS_E;
  const aDef = YOKAI[ev.attacker.id];
  const aSkill = aDef.skill;
  const kindFx = SKILL_KIND_FX[aSkill.kind] ?? SSR_FX_COLORS;
  const tier = rarityTier(ev.attacker.id);
  const scale = TIER_SCALE[tier];
  const vTier = rarityTier(ev.victim.id);
  const vScale = TIER_SCALE[vTier];
  const passiveEffects = ev.effects ?? [];
  /* 会心系(crit/rush/moon/heads)の発動 = "当たり"。攻撃駒のスキルに加え、覚醒・共鳴のprocが並ぶことがある */
  const jackpot = ev.procs.some(p => p.name === aSkill.name) && JACKPOT_KINDS.has(aSkill.kind);
  const multSub = !ev.procs.some(p => p.name === aSkill.name) ? undefined
    : (aSkill.kind === 'crit' || aSkill.kind === 'rush' || aSkill.kind === 'moon') ? `×${aSkill.mult}`
    : aSkill.kind === 'zone' ? `+${aSkill.bonus}` : undefined;

  /* 通算発動記録(自分のスキル・覚醒・共鳴のみ) */
  for (const proc of ev.procs) {
    if (proc.owner === 'p') Records.bump(proc.name);
  }

  /* スキル発動カットイン(系統別の前置き演出+系統色・レアリティ格のカットイン)。
     覚醒・共鳴のprocは攻撃駒スキルと別名で並ぶため、前置き演出はスキル本体の1回だけ */
  for (const proc of ev.procs) {
    const isSkillProc = proc.name === aSkill.name;
    if (isSkillProc && jackpot) {
      /* 当たり: 暗転スポットライト+吸い込み(レアリティが高いほど長く・濃く) */
      FX.spotlight(c.x, c.y, kindFx[1], 1700 + tier * 200);
      FX.converge(c.x, c.y, kindFx[1], Math.round(20 * scale), 90 + tier * 15);
      if (tier === 3) FX.converge(c.x, c.y, kindFx[0], 14, 150);
      await sleep(330);
    } else if (isSkillProc && aSkill.kind === 'zone') {
      /* 敵陣強襲: 藍の衝撃波(高頻度なのでタメなし) */
      FX.ring(c.x, c.y, kindFx[1], Math.round(16 * scale), 70);
      FX.shockwave(c.x, c.y, kindFx[1], 8 + 2 * tier);
    } else if (isSkillProc && aSkill.kind === 'heal') {
      /* 福招き: 緑の光が集まる */
      FX.converge(c.x, c.y, kindFx[1], Math.round(16 * scale), 80);
    }
    await FX.cutin(proc.img, proc.name, proc.text,
      aDef.boss ? 'boss' : 'skill', isSkillProc ? kindFx : SSR_FX_COLORS, tier);
  }

  if (passiveEffects.length > 0) {
    passiveEffects.slice(0, 4).forEach((effect, i) => {
      const color = effect.owner === 'p' ? '#9fdcff' : '#ffb0a0';
      setTimeout(() => FX.floatLabel(c.x, c.y + 32 + i * 22, `${effect.name} ${effect.text}`, color), i * 90);
    });
  }

  /* 化け狸: 葉隠れ(葉吹雪と共に) */
  if (ev.decoy) {
    FX.leaves(c.x, c.y);
    await FX.cutin(ev.decoy.img, ev.decoy.name, 'ダメージ半減! 駒は葉っぱに化けていた', 'counter',
      SKILL_KIND_FX.decoy, vTier);
    FX.leaves(c.x, c.y);
  }

  /* 撃破演出: 斬撃 → ヒットストップ(一瞬静止) → 爆発(高コンボ中は常に大) */
  const victimEl = pieceEls.get(ev.victim.uid);
  const big = ev.damage >= 450 || ev.procs.length > 0 || ev.combo >= 3;
  const survivor = !!(ev.charm || ev.hydra);

  AudioSys.play(big ? 'bighit' : 'capture');
  FX.slash(c.x, c.y, big);
  if (victimEl) victimEl.classList.add('hitflash');
  await sleep(jackpot ? 260 : big ? 150 : 100); // ヒットストップ(当たりは長めに溜める)

  if (victimEl && !survivor) {
    victimEl.classList.add('dying');
    setTimeout(() => { victimEl.remove(); pieceEls.delete(ev.victim.uid); }, 420);
  } else if (victimEl && ev.charm) {
    victimEl.classList.remove('owner-p', 'owner-e', 'hitflash');
    victimEl.classList.add(`owner-${ev.attacker.owner}`);
  } else if (victimEl) {
    victimEl.classList.remove('hitflash');
  }

  if (big) FX.flash('rgba(255,240,205,0.6)', 200);
  else if (special) FX.flash(`color-mix(in srgb, ${special[1]} 30%, transparent)`, 180);
  FX.burst(c.x, c.y, colors, (big ? 54 : 30) + (special ? 18 : 0), big ? 8.5 : 6);
  FX.ring(c.x, c.y, colors[0], 16, big ? 80 : 55);
  if (special) FX.ring(c.x, c.y, special[2], 18, big ? 100 : 70);
  FX.shockwave(c.x, c.y, colors[0], big ? 16 : 9);
  /* 系統ごとの署名エフェクト(撃破に重ねる。量はレアリティでスケール) */
  if (ev.procs.some(p => p.name === aSkill.name)) {
    if (aSkill.kind === 'crit') {
      /* 炎: 立ち昇る火柱+火の粉 */
      FX.pillar(c.x, c.y, kindFx);
      if (tier >= 2) setTimeout(() => FX.pillar(c.x, c.y, kindFx), 140);
      FX.ring(c.x, c.y, kindFx[2], Math.round(18 * scale), 110);
      setTimeout(() => FX.burst(c.x, c.y, [...kindFx], Math.round(26 * scale), 9), 120);
    } else if (aSkill.kind === 'moon') {
      /* 月光: 天から降る光柱+藍紫の月輪 */
      FX.pillar(c.x, c.y, kindFx);
      setTimeout(() => FX.pillar(c.x, c.y, kindFx), 140);
      FX.ring(c.x, c.y, kindFx[0], 22, 130);
      FX.converge(c.x, c.y, kindFx[1], Math.round(18 * scale), 120);
      setTimeout(() => FX.burst(c.x, c.y, [...kindFx], Math.round(28 * scale), 8.5), 120);
    } else if (aSkill.kind === 'heads') {
      /* 八岐の首: 多段斬撃の連打 */
      FX.slash(c.x, c.y, true);
      setTimeout(() => FX.slash(c.x, c.y, true), 110);
      setTimeout(() => FX.slash(c.x, c.y, true), 220);
      FX.pillar(c.x, c.y, kindFx);
      FX.burst(c.x, c.y, [...kindFx], Math.round(26 * scale), 9);
    } else if (aSkill.kind === 'legion') {
      /* 百鬼の陣: 宵闇の波紋が広がる */
      FX.ring(c.x, c.y, kindFx[1], 24, 140);
      FX.ring(c.x, c.y, kindFx[2], 18, 100);
      FX.burst(c.x, c.y, [...kindFx], Math.round(22 * scale), 7.5);
    } else if (aSkill.kind === 'rush') {
      /* 疾風: 風の斬撃+水平に走る翠の奔流 */
      FX.slash(c.x, c.y, true);
      FX.trail(c.x - 140, c.y, c.x + 140, c.y, [...kindFx], true);
      FX.burst(c.x, c.y, [...kindFx], Math.round(24 * scale), 9.5);
      if (tier >= 2) FX.ring(c.x, c.y, kindFx[1], 18, 100);
    } else if (aSkill.kind === 'zone') {
      FX.burst(c.x, c.y, [...kindFx], Math.round(20 * scale), 7);
    }
  }
  FX.damageNumber(c.x, c.y - 14, ev.damage, jackpot ? 'crit' : big ? 'big' : 'normal', multSub);

  /* 座敷童子: 回復(緑の光柱) */
  if (ev.heal > 0) {
    FX.pillar(c.x, c.y, SKILL_KIND_FX.heal);
    FX.damageNumber(c.x, c.y - 64, `+${ev.heal}`, 'heal');
  }

  /* コンボ表示: 数が伸びるほど表示・音・画面が段階的に加熱する */
  if (ev.combo >= 2) {
    FX.comboLabel(c.x, c.y - 74, ev.combo, isPlayer);
    AudioSys.playCombo(ev.combo);
    if (ev.combo >= 3) FX.shake(ev.combo >= 4);
  }

  updateHP(ev.hp);
  updateCombo(ev.attacker.owner);
  await sleep(big ? 600 : 480);

  /* 罠の反撃(1対局1回級: 暗転→呪詛の大爆発) */
  if (ev.counter) {
    FX.spotlight(c.x, c.y, '#c88aff', 1800 + vTier * 200);
    FX.converge(c.x, c.y, '#c88aff', Math.round(20 * vScale), 100);
    await sleep(330);
    await FX.cutin(ev.counter.img, ev.counter.name, `反撃ダメージ ${ev.counter.dmg}!`, 'counter',
      SKILL_KIND_FX.counter, vTier);
    FX.burst(c.x, c.y, ['#c88aff', '#8a4aff', '#e8d0ff'], Math.round(42 * vScale), 8.5);
    FX.ring(c.x, c.y, '#e8d0ff', 18, 80);
    FX.ring(c.x, c.y, '#8a4aff', 22, 120);
    FX.pillar(c.x, c.y, ['#e8d0ff', '#c88aff', '#8a4aff']);
    FX.shockwave(c.x, c.y, '#c88aff', 18);
    FX.flash('rgba(200,140,255,0.5)', 220);
    AudioSys.play('bighit');
    FX.damageNumber(c.x, c.y - 14, ev.counter.dmg, 'counter');
    updateHP(ev.counter.hp);
    await sleep(700);
  }

  /* 鬼火の道連れ(最大級: 暗転→白閃光→特大二段爆発) */
  if (ev.explode) {
    FX.spotlight(c.x, c.y, '#ff9a3c', 2000);
    FX.converge(c.x, c.y, '#ff6b3c', 30, 110);
    await sleep(330);
    await FX.cutin(ev.explode.img, ev.explode.name, '取った駒を道連れに爆散!', 'counter',
      SKILL_KIND_FX.explode, vTier);
    const aEl = pieceEls.get(ev.explode.uid);
    if (aEl) {
      aEl.classList.add('dying');
      setTimeout(() => { aEl.remove(); pieceEls.delete(ev.explode!.uid); }, 420);
    }
    FX.flash('rgba(255,255,255,0.85)', 130);
    FX.burst(c.x, c.y, ['#ff9a3c', '#ff5d5d', '#ffd24a'], 70, 10);
    FX.ring(c.x, c.y, '#ffd24a', 18, 90);
    FX.ring(c.x, c.y, '#ff9a3c', 22, 130);
    FX.pillar(c.x, c.y, ['#ffd24a', '#ff9a3c', '#ff5d5d']);
    FX.shockwave(c.x, c.y, '#ff9a3c', 20);
    setTimeout(() => {
      FX.flash('rgba(255,160,80,0.5)', 220);
      FX.burst(c.x, c.y, ['#ff9a3c', '#ffd24a'], 36, 7);
      FX.shockwave(c.x, c.y, '#ffd24a', 14);
    }, 150);
    AudioSys.play('bighit');
    await sleep(760);
  }

  /* 妖狐相伝: 相方を取られた狐の激怒(次の一撃 確定会心) */
  if (ev.enrage) {
    const eDef = YOKAI[ev.enrage.id];
    const rs = RESONANCES.find(r => r.name === ev.enrage!.name);
    const colors = rs ? [...rs.colors] : [...SSR_FX_COLORS];
    const el = pieceEls.get(ev.enrage.uid);
    FX.flash(`color-mix(in srgb, ${colors[1]} 35%, transparent)`, 220);
    await FX.cutin(eDef.img, `共鳴【${ev.enrage.name}】`, `${eDef.name}が激怒 ― 次の一撃は確定会心!`, 'skill',
      colors, 3);
    if (el) {
      el.classList.add('enraged');
      const rect = el.getBoundingClientRect();
      FX.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, colors, 30, 6);
      FX.ring(rect.left + rect.width / 2, rect.top + rect.height / 2, colors[1], 16, 70);
    }
    if (ev.enrage.owner === 'p') Records.bump(`共鳴【${ev.enrage.name}】`);
    await sleep(300);
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
  setBattleStatusOpen(false);
  AudioSys.stopBgm();
  $('combo-vignette').className = '';
  const draw = onlineEndReason === 'draw' || G!.reason === 'draw';
  const win = G!.winner === 'p';
  const solo = !onlineSide;
  trackLandingEvent('result_view', {
    online: !!onlineSide,
    result: draw ? 'draw' : win ? 'win' : 'lose',
    reason: onlineEndReason || G!.reason || null,
  });
  const enemyBoss = onlineSide ? (onlineMatch?.opponentBossId || ENEMY_BOSS) : activeSoloStage.bossId;
  const enemyBossName = YOKAI[enemyBoss].name;
  $<HTMLImageElement>('result-boss').src = YOKAI[win ? Meta.bossId() : enemyBoss].img;

  const streakEl = $('result-hyakki-streak');
  const onlineActions = $('result-actions-online');
  const hyakkiActions = $('result-actions-hyakki');

  if (solo) {
    if (win && !soloWinCounted) {
      soloStreak++;
      soloWinCounted = true;
      soloBestStreak = Math.max(soloBestStreak, soloStreak);
    }
    const brokenStreak = soloStreak;
    if (win) {
      streakEl.textContent = `${soloStreak}連勝`;
      streakEl.classList.remove('is-broken');
      $('result-sub').textContent = reasonsFor(win, enemyBossName);
    } else {
      streakEl.textContent = brokenStreak > 0 ? `連勝はここで途切れた（${brokenStreak}連勝）` : '連勝ならず';
      streakEl.classList.add('is-broken');
      $('result-sub').textContent = reasonsFor(win, enemyBossName)
        + (soloBestStreak > 0 ? `　今週ベスト ${soloBestStreak}` : '');
    }
    streakEl.classList.remove('hidden');
    onlineActions.classList.add('hidden');
    hyakkiActions.classList.remove('hidden');
    $('btn-hyakki-continue').classList.toggle('hidden', !win);
    $('btn-hyakki-retry').classList.toggle('hidden', win);

    $('result-reward').textContent = win ? '勝利報酬を確認中…' : '';
    $('result-reward').classList.toggle('hidden', !win);
    if (win) {
      Meta.recordSoloWin().then(reward => {
        $('result-reward').textContent = reward > 0
          ? `勝利報酬: ガチャチケット 🎟 +${reward}`
          : '本日の勝利報酬は上限に達しました';
      }).catch(() => {
        $('result-reward').textContent = '勝利報酬の付与に失敗しました(通信状態を確認)';
      });
    }

    if (hyakkiRankEligible()) {
      hyakkiRankingAt = 0;
      Meta.hyakkiResult(win).then(p => {
        if (!p) return;
        applyHyakkiStanding(p);
        if (win) {
          streakEl.textContent = `${p.currentStreak}連勝`
            + (p.rank ? `（今週${p.rank}位）` : '');
        } else {
          streakEl.textContent = brokenStreak > 0
            ? `連勝はここで途切れた（${brokenStreak}連勝）`
            : '連勝ならず';
          if (p.bestStreak > 0) {
            $('result-sub').textContent = reasonsFor(win, enemyBossName)
              + `　今週ベスト ${p.bestStreak}`
              + (p.rank ? `（${p.rank}位）` : '');
          }
        }
      }).catch(() => { /* 通信断でもローカル表示は維持 */ });
    }
    if (!win) soloStreak = 0;
  } else {
    streakEl.classList.add('hidden');
    onlineActions.classList.remove('hidden');
    hyakkiActions.classList.add('hidden');
    $('result-sub').textContent = reasonsFor(win, enemyBossName);
    const lines: string[] = [];
    if (win && onlineReward > 0) lines.push(`勝利報酬: ガチャチケット 🎟 +${onlineReward}`);
    if (onlineParticipation > 0) lines.push(`参加報酬: ガチャチケット 🎟 +${onlineParticipation}`);
    if (onlineEventYokai) lines.push(`対戦会限定「${YOKAI[onlineEventYokai]?.name ?? onlineEventYokai}」を入手!`);
    if (lines.length > 0) {
      $('result-reward').textContent = lines.join(' ／ ');
      $('result-reward').classList.remove('hidden');
    } else {
      $('result-reward').classList.add('hidden');
    }
  }

  const title = $('result-title');
  title.textContent = draw ? '引き分け' : win ? '討伐成功' : '敗北';
  title.className = win ? 'win' : 'lose';
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

function reasonsFor(win: boolean, enemyBossName: string): string {
  const reasons: Record<string, string> = {
    boss: win ? `敵大将・${enemyBossName}を討ち取った!` : '我が大将が討ち取られた…',
    hp: win ? `${enemyBossName}の魂力を打ち砕いた!` : '魂力が尽き果てた…',
    explode: win ? '鬼火が敵大将を道連れにした!' : '我が大将が鬼火の道連れに…',
    nomoves: win ? '敵軍は身動きが取れなくなった!' : '我が軍は身動きが取れなくなった…',
    resign: '投了した…',
    timeout: win ? '相手の秒読みが切れた' : '秒読みが切れた…',
    disconnect: win ? '相手の再接続猶予が切れた' : '再接続猶予が切れた…',
    draw: onlineEndReason === 'draw' && G!.reason === 'draw'
      ? '飢餓の夜で双方の魂力が尽きた' : '300手に達したため引き分け',
    hunger: win ? '飢餓の夜で敵の魂力が尽きた!' : '飢餓の夜で魂力が尽きた…',
  };
  const reasonKey = onlineEndReason || G!.reason || '';
  if (reasonKey === 'draw') {
    return G!.reason === 'draw' ? '飢餓の夜で双方の魂力が尽きた' : '300手に達したため引き分け';
  }
  return reasons[reasonKey] || '';
}

/* ============================== 駒一覧 ============================== */
const PIECE_CATALOG_ORDER = [
  'kyubi', 'kyubi_eclipse', 'kyubi_hasha', 'shuten', 'shuten_kishin', 'kooni', 'nekomata', 'ittan', 'nue',
  'kappa', 'nurikabe', 'tengu', 'rokuro', 'tamamo', 'tamamo_keikoku', 'nurarihyon',
  'nurarihyon_hyakki', 'ibaraki', 'ibaraki_rashomon', 'yamata', 'gashadokuro', 'sukuna', 'ingyo',
  'aooni', 'kasha', 'kamaitachi', 'raiju', 'suiko', 'oonyudo',
  'karakasa', 'daitengu', 'hitouban', 'yukionna', 'tsuchigumo', 'sunakake', 'baku', 'zashiki', 'chochin', 'tanuki', 'onibi',
  'aoandon', 'umibozu', 'wanyudo', 'yatagarasu', 'oomyukade', 'shiranui', 'enenra', 'inugami', 'tenome', 'nopperabo',
  'makuragaeshi', 'rinka', 'tsurube', 'bakezouri', 'sunekosuri', 'kodama',
];
const PIECE_RARITY_ORDER: Rarity[] = ['SSR', 'SR', 'R', 'N'];
const PIECE_RARITY_RANK: Record<Rarity, number> = { SSR: 0, SR: 1, R: 2, N: 3 };

function bossChip(): HTMLSpanElement {
  const type = document.createElement('span');
  type.className = 'type-chip t-boss';
  type.textContent = '大将';
  return type;
}

function ssrIntroLines(id: string): string[] {
  const def = YOKAI[id];
  if (def.rarity !== 'SSR') return [];
  const lines: string[] = [];
  if (def.variantOf) lines.push('異装: 通常版と同じ性能。専用演出と覚醒技名を持つ');
  if (def.skill.kind === 'moon') {
    lines.push(`月齢: 満月に駒を取ると確定会心 ×${def.skill.mult}`);
  } else if (def.skill.kind === 'heads') {
    lines.push(`成長: 駒を取るごとに与ダメ+${Math.round(def.skill.step * 100)}%(最大+${Math.round(def.skill.step * def.skill.max * 100)}%)`);
  } else if (def.skill.kind === 'legion') {
    lines.push(`布陣: 盤上の味方1体ごとに与ダメ+${Math.round(def.skill.per * 100)}%(最大+${Math.round(def.skill.cap * 100)}%)`);
  } else if (def.skill.kind === 'crit') {
    lines.push(`会心: 駒を取った時${Math.round(def.skill.chance * 100)}%でダメージ×${def.skill.mult}`);
  } else if (def.skill.kind === 'charm') {
    lines.push('傾国: 取った駒をその場で味方にし、自身は元マスへ戻る');
  } else if (def.skill.kind === 'recall') {
    lines.push('回帰: 取られても自分の持ち駒に戻る');
  } else if (def.skill.kind === 'hydra') {
    lines.push(`八岐: 取られても隣接へ逃げる(${def.skill.extra}回まで)。大将は取れない`);
  } else if (def.skill.kind === 'famine') {
    lines.push(`飢餓: 飢餓の夜の取りが×${def.skill.mult}かつ魂力${def.skill.heal}回復`);
  } else if (def.skill.kind === 'dual') {
    lines.push('双面: 取ったあと隣接の別敵(大将以外)を追撃(2体目はダメージ半分)');
  }
  /* veil のスキル本文が十分なため、SSR特性での重複要約は出さない */
  if (def.awakenName) lines.push(`覚醒: ${def.awakenName} / 自分の手番3回のあいだATK×${AWAKEN_ATK}`);
  const rs = RESONANCES.find(r => r.pair.includes(baseIdOf(id)));
  if (rs) lines.push(`因縁: ${rs.name}`);
  return lines;
}

function buildPieceCatalog() {
  buildPieceCatalogControls();
  renderPieceCatalogCards();
}

function buildPieceCatalogControls() {
  const rarity = $<HTMLSelectElement>('pieces-rarity-filter');
  rarity.replaceChildren(new Option('全レア', 'all'));
  for (const r of PIECE_RARITY_ORDER) rarity.appendChild(new Option(RARITY_INFO[r].label, r));
  $('pieces-search').oninput = renderPieceCatalogCards;
  rarity.onchange = renderPieceCatalogCards;
}

function renderPieceCatalogCards() {
  const wrap = $('pieces-list');
  wrap.replaceChildren();
  const q = $<HTMLInputElement>('pieces-search').value.trim().toLowerCase();
  const rarityFilter = $<HTMLSelectElement>('pieces-rarity-filter').value;
  const pieces = PIECE_CATALOG_ORDER
    .map(id => YOKAI[id])
    .filter(def => !!def)
    .filter(def => rarityFilter === 'all' || def.rarity === rarityFilter)
    .filter(def => {
      if (!q) return true;
      return `${def.name} ${def.moveText} ${def.skill.name} ${def.skill.desc} ${ssrIntroLines(def.id).join(' ')}`.toLowerCase().includes(q);
    })
    .sort((a, b) =>
      Number(!a.boss) - Number(!b.boss)
      || PIECE_RARITY_RANK[a.rarity] - PIECE_RARITY_RANK[b.rarity]
      || PIECE_CATALOG_ORDER.indexOf(a.id) - PIECE_CATALOG_ORDER.indexOf(b.id));

  $('pieces-summary').textContent = `${pieces.length} / ${PIECE_CATALOG_ORDER.length} 体`;
  if (pieces.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'pieces-empty';
    empty.textContent = '条件に合う駒がありません。';
    wrap.appendChild(empty);
    return;
  }

  for (const def of pieces) {
    const ri = RARITY_INFO[def.rarity];
    const card = document.createElement('article');
    card.className = `piece-card ${ri.cls}${def.variantOf ? ' special-catalog-card' : ''}`;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${def.name}の詳細を見る`);
    card.onclick = () => { AudioSys.play('click'); openPieceDetail(def.id); };
    card.onkeydown = ev => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        AudioSys.play('click');
        openPieceDetail(def.id);
      }
    };
    if (def.summonColors) {
      card.style.setProperty('--special-light', def.summonColors[0]);
      card.style.setProperty('--special-primary', def.summonColors[1]);
      card.style.setProperty('--special-accent', def.summonColors[2]);
    }

    const art = document.createElement('div');
    art.className = 'piece-art';
    const img = document.createElement('img');
    img.src = def.imgSm;
    img.alt = def.name;
    img.loading = 'lazy';
    art.appendChild(img);

    const body = document.createElement('div');
    body.className = 'rp-body';
    const top = document.createElement('div');
    top.className = 'rp-topline';
    const rarity = document.createElement('span');
    rarity.className = `rarity-chip ${ri.cls}`;
    rarity.textContent = def.variantOf ? `${ri.label} 異装` : ri.label;
    top.append(rarity);
    if (def.boss) top.append(bossChip());

    const name = document.createElement('div');
    name.className = 'rp-name';
    name.textContent = def.name;

    body.append(top, name);
    card.append(art, body);
    wrap.appendChild(card);
  }
}

function openPieceDetail(id: string) {
  const def = YOKAI[id];
  const ri = RARITY_INFO[def.rarity];
  const img = $<HTMLImageElement>('piece-detail-img');
  img.src = def.img;
  img.alt = def.name;
  $('btn-piece-detail-zoom').setAttribute('aria-label', `${def.name}の画像を拡大`);
  $('piece-detail-tags').innerHTML =
    `<span class="rarity-chip ${ri.cls}">${def.variantOf ? `${ri.label} 異装` : ri.label}</span>` +
    (def.boss ? `<span class="type-chip t-boss">大将</span>` : '');
  $('piece-detail-name').textContent = def.name;
  $('piece-detail-atk').textContent = `ATK ${def.atk}`;
  $('piece-detail-move').textContent = def.moveText;
  $('piece-detail-skill-name').textContent = def.skill.name;
  const records = Records.get(def.skill.name);
  let skillDesc = def.skill.desc;
  const introLines = ssrIntroLines(def.id);
  if (introLines.length > 0) skillDesc += `\n【SSR特性】${introLines.join('\n')}`;
  if (def.awakenName && introLines.length === 0) skillDesc += `\n【覚醒技】${def.awakenName} ― 覚醒ゲージ満タンで発動、自分の手番3回のあいだATK×${AWAKEN_ATK}`;
  const rs = RESONANCES.find(r => r.pair.includes(baseIdOf(def.id)));
  if (rs) skillDesc += `\n【因縁効果】${rs.desc}`;
  if (records > 0) skillDesc += `\n通算発動 ${records}回`;
  $('piece-detail-skill-desc').textContent = skillDesc;
  $('modal-piece-detail').classList.remove('hidden');
}

function closePieceDetail() {
  closePieceZoom();
  $('modal-piece-detail').classList.add('hidden');
}

function openPieceZoom(src: string, name: string) {
  if (!src) return;
  const img = $<HTMLImageElement>('piece-zoom-img');
  img.src = src;
  img.alt = name;
  $('modal-piece-zoom').classList.remove('hidden');
}

function closePieceZoom() {
  $('modal-piece-zoom').classList.add('hidden');
}

function renderPieceCatalog() {
  const wrap = $('pieces-list');
  const order = [
    'kyubi', 'kyubi_eclipse', 'kyubi_hasha', 'shuten', 'shuten_kishin', 'kooni', 'nekomata', 'ittan', 'nue',
    'kappa', 'nurikabe', 'tengu', 'rokuro', 'tamamo', 'tamamo_keikoku', 'nurarihyon',
    'nurarihyon_hyakki', 'ibaraki', 'ibaraki_rashomon', 'yamata', 'aooni', 'kasha', 'kamaitachi', 'raiju', 'suiko', 'oonyudo',
    'karakasa', 'daitengu', 'hitouban', 'yukionna', 'tsuchigumo', 'sunakake', 'baku', 'zashiki', 'chochin', 'tanuki', 'onibi',
  ];
  for (const id of order) {
    const def = YOKAI[id];
    const ri = RARITY_INFO[def.rarity];
    const row = document.createElement('div');
    row.className = `piece-card ${ri.cls}${def.variantOf ? ' special-catalog-card' : ''}`;
    if (def.summonColors) {
      row.style.setProperty('--special-light', def.summonColors[0]);
      row.style.setProperty('--special-primary', def.summonColors[1]);
    }
    row.innerHTML =
      `<img src="${def.imgSm}" alt="${def.name}">` +
      `<div class="rp-body">` +
      `<div class="rp-name">` +
      (def.boss ? `<span class="type-chip t-boss">大将</span>` : '') +
      `<span class="rarity-chip ${ri.cls}">${def.variantOf ? `${ri.label} 異装` : ri.label}</span> ${def.name} <b>ATK ${def.atk}</b>` +
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
