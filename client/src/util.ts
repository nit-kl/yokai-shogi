/* DOMユーティリティ */

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function showScreen(id: string): void {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

/* モーダルの暗幕はフェードインさせる(スマホで画面が一瞬真っ暗になってチラつくため)。
   ただしモーダルから別モーダルへの切り替えや重ね開きでは、フェード中に下の画面が透けるので即時表示にする */
export function initModalTransitions(): void {
  const modals = [...document.querySelectorAll<HTMLElement>('.modal')];
  const open = new Map(modals.map(m => [m, !m.classList.contains('hidden')]));
  let lastClosedAt = -Infinity;
  const observer = new MutationObserver(records => {
    for (const { target } of records) {
      const modal = target as HTMLElement;
      const now = !modal.classList.contains('hidden');
      if (open.get(modal) === now) continue;
      open.set(modal, now);
      if (!now) {
        lastClosedAt = performance.now();
        modal.classList.remove('modal-instant');
        continue;
      }
      const handoff = performance.now() - lastClosedAt < 100 || modals.some(m => m !== modal && open.get(m));
      modal.classList.toggle('modal-instant', handoff);
    }
  });
  for (const modal of modals) observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
}
