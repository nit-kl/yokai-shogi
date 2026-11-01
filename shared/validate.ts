/* ============================================================
   百鬼盤 - 共用バリデーション(クライアント/サーバー共用)
   編成検証はクライアント(即時フィードバック)とサーバー(権威検証)で
   必ず同一ロジックを使う(doc 02 / 04)
   ============================================================ */

import { COLS, FORMATION_COST_CAP, YOKAI, formationCost } from './data';

export type FormationRows = (string | null)[][];

/* 形・所持・重複・大将。コスト超過では落とさない(保存済み編成を消さないため) */
export function validateFormationShape(rows: unknown, owned: ReadonlySet<string>): string | null {
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

/* 開戦前の配置。対局が始まったあとの移動は縛らない。
   player は [前段, 最奥段]、enemy は [最奥段, 前段]。
   大将は自陣の奥の段、その真正面（敵側の隣マス）に味方が1体。 */
export function bossFrontGuardIssue(
  rows: readonly (readonly (string | null)[])[],
  side: 'player' | 'enemy',
): string | null {
  if (rows.length !== 2) return '編成データが不正です';
  const rear = side === 'player' ? 1 : 0;
  const front = side === 'player' ? 0 : 1;
  const rearRow = rows[rear];
  const frontRow = rows[front];
  if (!rearRow || !frontRow) return '編成データが不正です';
  let bossX = -1;
  for (let x = 0; x < rearRow.length; x++) {
    const id = rearRow[x];
    if (id && YOKAI[id]?.boss) bossX = x;
  }
  for (let x = 0; x < frontRow.length; x++) {
    const id = frontRow[x];
    if (id && YOKAI[id]?.boss) return '大将は奥の段に配置してください';
  }
  if (bossX < 0) return '大将は奥の段に配置してください';
  if (!frontRow[bossX]) return '大将の真正面に味方を1体配置してください';
  return null;
}

/* 正常なら null、問題があればエラーメッセージを返す */
export function validateFormation(rows: unknown, owned: ReadonlySet<string>): string | null {
  const shape = validateFormationShape(rows, owned);
  if (shape) return shape;
  const guard = bossFrontGuardIssue(rows as FormationRows, 'player');
  if (guard) return guard;
  if (formationCost(rows as FormationRows) > FORMATION_COST_CAP) {
    return `編成コストが上限の${FORMATION_COST_CAP}を超えています`;
  }
  return null;
}

/* 保存済み編成のまま対戦に入れるか。超過時は入り直しを案内する */
export function formationBattleBlock(rows: unknown): string | null {
  if (!Array.isArray(rows) || rows.length !== 2 ||
      rows.some(r => !Array.isArray(r) || r.length !== COLS)) return '編成データが不正です';
  const grid = rows as FormationRows;
  let bosses = 0;
  for (const id of grid.flat()) {
    if (!id) continue;
    const def = YOKAI[id];
    if (!def) return '編成データが不正です';
    if (def.boss) bosses++;
  }
  if (bosses !== 1) return '大将を1体配置してください';
  const guard = bossFrontGuardIssue(grid, 'player');
  if (guard) return guard;
  const cost = formationCost(grid);
  if (cost > FORMATION_COST_CAP) {
    return `いまの編成コストは${cost}です。上限は${FORMATION_COST_CAP}です。編成を整えてから対戦してください`;
  }
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
