/* Steam DLC 付与(冪等)。full_collection → GACHA_POOL を user_yokai へ */

import { GACHA_POOL } from '../../../shared/data';
import { STEAM_DLC_FULL_COLLECTION, type SteamDlcId } from '../../../shared/steam-dlc';
import { getOwnedSet, isConstraintError } from '../db';

export type GrantSteamDlcResult = {
  grantedDlc: boolean;
  yokaiIds: string[];
};

function yokaiIdsForDlc(dlcId: SteamDlcId): string[] {
  if (dlcId === STEAM_DLC_FULL_COLLECTION) return [...GACHA_POOL];
  return [];
}

export async function grantSteamDlc(
  db: D1Database,
  userId: string,
  dlcId: SteamDlcId,
): Promise<GrantSteamDlcResult> {
  const existing = await db
    .prepare('SELECT 1 AS x FROM steam_entitlement_grants WHERE user_id = ?1 AND dlc_id = ?2')
    .bind(userId, dlcId)
    .first();
  if (existing) return { grantedDlc: false, yokaiIds: [] };

  const owned = await getOwnedSet(db, userId);
  const targets = yokaiIdsForDlc(dlcId).filter(id => !owned.has(id));
  const stmts = [
    db.prepare('INSERT INTO steam_entitlement_grants (user_id, dlc_id, yokai_new) VALUES (?1, ?2, ?3)')
      .bind(userId, dlcId, targets.length),
    ...targets.map(id =>
      db.prepare('INSERT INTO user_yokai (user_id, yokai_id) VALUES (?1, ?2)').bind(userId, id)),
  ];

  try {
    await db.batch(stmts);
  } catch (e) {
    if (!isConstraintError(e)) throw e;
    /* 並行同期で既に付与済み */
    return { grantedDlc: false, yokaiIds: [] };
  }

  return { grantedDlc: true, yokaiIds: targets };
}
