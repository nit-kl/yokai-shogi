/* Steam DLC 定義(doc 23)。App 側の商品 ID はストア登録後に差し替える */

/** 全駒解放パック(ガチャ排出対象を一括所持) */
export const STEAM_DLC_FULL_COLLECTION = 'full_collection';

export const STEAM_DLC_IDS = [STEAM_DLC_FULL_COLLECTION] as const;
export type SteamDlcId = (typeof STEAM_DLC_IDS)[number];

export function isSteamDlcId(id: string): id is SteamDlcId {
  return (STEAM_DLC_IDS as readonly string[]).includes(id);
}
