/* ============================================================
   百鬼盤 - 共用バリデーション(クライアント/サーバー共用)
   編成検証はクライアント(即時フィードバック)とサーバー(権威検証)で
   必ず同一ロジックを使う(doc 02 / 04)
   ============================================================ */

import { COLS, YOKAI } from './data';

export type FormationRows = (string | null)[][];

/* 正常なら null、問題があればエラーメッセージを返す */
export function validateFormation(rows: unknown, owned: ReadonlySet<string>): string | null {
  if (!Array.isArray(rows) || rows.length !== 2 ||
      rows.some(r => !Array.isArray(r) || r.length !== COLS)) return '編成データが不正です';
  const grid = rows as FormationRows;
  const ids = grid.flat().filter((id): id is string => !!id);
  let bosses = 0;
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string') return '編成データが不正です';
    const def = YOKAI[id];
    if (!def || !owned.has(id)) return '所持していない妖怪が含まれています';
    if (seen.has(id)) return '同じ妖怪は1体しか配置できません';
    seen.add(id);
    if (def.boss) bosses++;
  }
  if (bosses !== 1) return '大将を1体配置してください';
  return null;
}

/* 表示名: 1〜10文字・制御文字/危険記号なし */
export function validateDisplayName(name: unknown): string | null {
  if (typeof name !== 'string') return '名前が不正です';
  const n = name.trim();
  if (n.length < 1 || n.length > 10) return '名前は1〜10文字で入力してください';
  // XSS等に使われやすい記号を拒否(描画側のtextContent統一と二段構え: doc 07)
  if (/[<>"'`\\]/.test(n)) return '使用できない文字が含まれています';
  // 制御文字(C0/C1領域)を拒否
  for (const ch of n) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x20 || (c >= 0x7f && c < 0xa0)) return '使用できない文字が含まれています';
  }
  return null;
}
