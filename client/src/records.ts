/* ============================================================
   百鬼盤 - スキル通算発動記録(ローカル)
   自分のスキル・覚醒・共鳴の発動回数を端末に積み上げ、図鑑詳細に表示する。
   サーバー同期はしない(演出・愛着用途のみ。doc 08)
   ============================================================ */

const SKILL_RECORDS_STORAGE_KEY = ['yokaiShogi', 'skillRecords', 'v1'].join('.');

function load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SKILL_RECORDS_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) as unknown : {};
    return (data && typeof data === 'object') ? data as Record<string, number> : {};
  } catch {
    return {};
  }
}

export const Records = {
  bump(name: string): void {
    const data = load();
    data[name] = (data[name] || 0) + 1;
    try { localStorage.setItem(SKILL_RECORDS_STORAGE_KEY, JSON.stringify(data)); } catch { /* 容量超過等は黙って諦める */ }
  },
  get(name: string): number {
    return load()[name] || 0;
  },
};
