# アセット権利棚卸し

> Steam / 商用配信のブロッカー解消用。  
> 最終更新: 2026-08-09（BGM は Gemini 有料で生成と確認 → OK(条件付き)）。

## 判定記号

| 記号 | 意味 |
|---|---|
| OK | 商用・Steam 配信に使えると確認済み |
| OK(条件付き) | 生成元規約上は商用可（プラン条件・第三者IP・Steam AI開示などの残リスクあり） |
| NG | 使えない / 差し替え必須 |
| 要確認 | 生成手段・ライセンス・商用条項が未確認 |
| N/A | 該当なし（コード生成など） |

## まとめ

| カテゴリ | 件数目安 | 状態 | メモ |
|---|---|---|---|
| 駒イラスト（公開 WebP） | 56 | **OK(条件付き)** | 全件 ChatGPT GPT Images。下記バッチA |
| 駒 stock PNG | 4 | **OK(条件付き)** | 同上バッチ（公開取込済み原画） |
| BGM MP3 | 3 | **OK(条件付き)** | Gemini（有料）/ Lyria。下記バッチC |
| SE | — | OK(方針) | WebAudio 合成（`client/src/audio.ts`）。外部音源ファイルなし |
| コード | — | OK(方針) | 自作（docs/11） |
| フォント | — | 要確認 | CSS で外部フォントを読む場合は別途記載 |

---

## バッチA — 駒イラスト（ChatGPT GPT Images）

| 項目 | 内容 |
|---|---|
| 生成手段 | ChatGPT の **GPT Images**（画像生成） |
| 権利帰属 | OpenAI Terms of Use 上、Output は利用者に帰属（OpenAI との関係において） |
| 商用(Web) | **可**（合法目的の商用利用。規約・Usage Policies 遵守が前提） |
| 商用(Steam) | **可（条件付き）** — 同上。ストアの AI 生成コンテンツ開示に従う |
| 参照 | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/)（Ownership of content / Output） |
| 確認日 | 2026-08-09（運営者申告 + 机上の規約確認） |

### 残リスク・運用上の注意（法的助言ではない）

1. **第三者IP**: プロンプトや出力が既存キャラ・商標・実在人物に酷似する場合は別問題。伝承名の妖怪を独自絵柄で描いている前提を維持する
2. **著作権登録**: 純AI生成物の著作物性は国・制度により議論がある。ゲーム配信の利用許諾（OpenAI↔利用者）とは別論点
3. **Steam**: ストアページで AI 生成アセットの開示が求められる場合がある。公開時にチェック
4. **規約変更**: 生成時点のアカウント種別（Free / Plus 等）と、申請時点の Terms / Usage Policies を再確認する

### 対象ファイル（公開 WebP 基幹名・56）

`aoandon` `aooni` `bakezouri` `baku` `chochin` `daitengu` `enenra` `gashadokuro` `hitouban` `ibaraki` `ibaraki-rashomon` `ingyo` `inugami` `ittan` `kamaitachi` `kappa` `karakasa` `kasha` `kodama` `kooni` `kyubi` `kyubi-eclipse` `kyubi-hasha` `makuragaeshi` `nekomata` `nopperabo` `nue` `nurarihyon` `nurarihyon-hyakki` `nurikabe` `onibi` `oomyukade` `oonyudo` `raiju` `rinka` `rokuro` `shiranui` `shuten` `shuten-kishin` `suiko` `sukuna` `sunakake` `sunekosuri` `tamamo` `tamamo-keikoku` `tanuki` `tengu` `tenome` `tsuchigumo` `tsurube` `umibozu` `wanyudo` `yamata` `yatagarasu` `yukionna` `zashiki`

配置:
- フル: `client/public/assets/pieces/*.webp`
- 小: `client/public/assets/pieces/sm/*.webp`
- パイプライン: `scripts/optimize-images.mjs` / `scripts/import-stock-pieces.mjs`

### stock（未公開候補・同バッチ）

`client/public/assets/pieces/stock/` — `ibaraki.png` / `ibaraki-rashomon.png` / `tamamo.png` / `tamamo-keikoku.png`

---

## バッチB — 旧 BGM（Suno 無料・撤去済み）

| 項目 | 内容 |
|---|---|
| 状態 | リポジトリから削除済み（2026-08-09） |
| 旧判定 | Suno 無料生成のため商用 NG だった |
| 参照 | [Suno help](https://help.suno.com/en/articles/2746945) |

## バッチC — 現行 BGM（Gemini 有料 / Lyria）

| 項目 | 内容 |
|---|---|
| 生成手段 | **Gemini（有料）** — 音楽生成（Lyria 系） |
| 運営者確認 | 有料プランで作成（2026-08-09） |
| 商用(Web) | **可（条件付き）** — Google 生成AI／Gemini Apps の商用条件・Prohibited Use Policy 遵守が前提 |
| 商用(Steam) | **可（条件付き）** — 同上。ストアの AI 生成開示・SynthID 透かしの扱いに留意 |
| 差し替え日 | 2026-08-09 |
| 再生 | タイトル=恒常ループ。対局=2曲からランダム選択（`BATTLE_BGM_SOURCES`） |
| 参照 | [Gemini API: Music generation](https://ai.google.dev/gemini-api/docs/music-generation) / Google Generative AI 利用規約 |

| ファイル | 種別 | 元ファイル名 | 権利 | 商用(Steam) |
|---|---|---|---|---|
| `audio/title-bgm.mp3` | BGM（恒常） | `The_Garden_Beyond_the_Gate.mp3` | OK(条件付き) | 可（条件付き） |
| `audio/battle-bgm.mp3` | BGM（対局） | `Black_Stone_Strategy.mp3` | OK(条件付き) | 可（条件付き） |
| `audio/battle-bgm-1.mp3` | BGM（対局） | `Candlelight_Gambit.mp3` | OK(条件付き) | 可（条件付き） |
| SE（コード合成） | SE | — | OK(方針) | OK |

※旧 `battle-bgm-2.mp3`（Suno 無料）は削除済み。

### 残リスク（法的助言ではない）

1. SynthID 等の透かしが付与されている場合がある
2. 既存楽曲の酷似プロンプトは第三者権利リスク
3. Steam の AI 生成コンテンツ開示対象になり得る
4. 申請前に Google / Gemini の現行規約を再確認する

---

## 完了条件

- [x] 公開駒 WebP 全件の生成手段・OpenAI 商用方針を記録（OK(条件付き)）
- [x] タイトル BGM 差し替え
- [x] 対局 BGM を2曲に差し替え（旧 Suno / `battle-bgm-2` 撤去）
- [x] バッチC を Gemini 有料として OK(条件付き) 化
- [x] stock（現行4枚）も同バッチとして記録
- [ ] フォントの出所確認（外部フォント使用時）
- [x] docs/11 を BGM 出所確定に合わせて更新
- [ ] Steam ストア提出時に AI 生成開示の要否を確認

駒・BGM の主ブロッカーは解消。残りはフォント確認・商標の J-PlatPat 記入・Steam AI 開示。
