/* DOMユーティリティ */

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function showScreen(id: string): void {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}
