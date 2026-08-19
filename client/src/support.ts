/* お問い合わせ(X DM) */

import { $ } from './util';
import { AudioSys } from './audio';

declare const __RELEASE__: string;

export const SUPPORT_X_HANDLE = 'nit_zunda_dev';
export const SUPPORT_X_USER_ID = '1982295445469827072';
export const SUPPORT_X_URL = `https://x.com/${SUPPORT_X_HANDLE}`;

const SCREEN_LABELS: Record<string, string> = {
  'screen-loading': '起動中',
  'screen-title': 'タイトル',
  'screen-solo': 'ソロ対戦',
  'screen-gacha': 'ガチャ',
  'screen-formation': '編成',
  'screen-pieces': '駒一覧',
  'screen-battle': '対局中',
  'screen-result': 'リザルト',
};

function currentScreenLabel(): string {
  const active = document.querySelector<HTMLElement>('.screen.active');
  return active ? (SCREEN_LABELS[active.id] ?? active.id) : '';
}

function buildDmText(context?: string): string {
  const screen = context ?? currentScreenLabel();
  return [
    '【百鬼盤】不具合・お問い合わせ',
    '',
    '【内容】',
    '',
    screen ? `【画面】${screen}` : '【画面】',
    `【Ver】${__RELEASE__}`,
    '',
    '※引き継ぎコード・認証情報は書かないでください',
  ].join('\n');
}

export function supportDmUrl(context?: string): string {
  const params = new URLSearchParams({
    recipient_id: SUPPORT_X_USER_ID,
    text: buildDmText(context),
  });
  return `https://x.com/messages/compose?${params}`;
}

export const SupportUI = {
  _context: null as string | null,

  init() {
    $('btn-support').onclick = () => { AudioSys.play('click'); this.open(); };
    $('btn-support-close').onclick = () => { AudioSys.play('click'); this.close(); };
    $('btn-support-dm').onclick = () => {
      AudioSys.play('click');
      window.open(supportDmUrl(this._context ?? undefined), '_blank', 'noopener,noreferrer');
    };
    $('btn-support-profile').onclick = () => {
      AudioSys.play('click');
      window.open(SUPPORT_X_URL, '_blank', 'noopener,noreferrer');
    };
  },

  open(context?: string) {
    this._context = context ?? null;
    $('support-handle').textContent = `@${SUPPORT_X_HANDLE}`;
    $('modal-support').classList.remove('hidden');
  },

  close() {
    this._context = null;
    $('modal-support').classList.add('hidden');
  },
};
