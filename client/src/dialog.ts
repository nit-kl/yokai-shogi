/* ブラウザ標準の confirm/alert は見出しにオリジン(localhost:5173 など)が出る */

import { $ } from './util';
import { AudioSys } from './audio';

export interface ConfirmOptions {
  title?: string;
  ok?: string;
  cancel?: string;
}

type Pending = { resolve: (ok: boolean) => void };

let wired = false;
let pending: Pending | null = null;
const queue: Array<() => void> = [];

function wire(): void {
  if (wired) return;
  wired = true;
  $('btn-confirm-ok').onclick = () => finish(true);
  $('btn-confirm-cancel').onclick = () => finish(false);
  $('modal-confirm').addEventListener('click', ev => {
    if (ev.target === $('modal-confirm')) finish(false);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    if ($('modal-confirm').classList.contains('hidden')) return;
    ev.preventDefault();
    finish(false);
  });
}

function finish(ok: boolean): void {
  if (!pending) return;
  AudioSys.play('click');
  $('modal-confirm').classList.add('hidden');
  const done = pending;
  pending = null;
  done.resolve(ok);
  queue.shift()?.();
}

function open(message: string, opts: ConfirmOptions, alertOnly: boolean): Promise<boolean> {
  wire();
  return new Promise(resolve => {
    const run = () => {
      pending = { resolve };
      $('confirm-title').textContent = opts.title ?? '確認';
      $('confirm-message').textContent = message;
      $('btn-confirm-ok').textContent = opts.ok ?? (alertOnly ? '閉じる' : 'はい');
      const cancel = $<HTMLButtonElement>('btn-confirm-cancel');
      cancel.textContent = opts.cancel ?? 'やめる';
      cancel.classList.toggle('hidden', alertOnly);
      $('modal-confirm').classList.remove('hidden');
      $('btn-confirm-ok').focus();
    };
    if (pending) queue.push(run);
    else run();
  });
}

export function confirmDialog(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return open(message, opts, false);
}

export async function alertDialog(message: string, opts: ConfirmOptions = {}): Promise<void> {
  await open(message, { title: opts.title ?? '確認', ok: opts.ok ?? '閉じる', cancel: opts.cancel }, true);
}
