# 用意してほしい画像（一目でやりたくなる見た目のため）

方針は「分析」ではなく、**タイトルを開いた瞬間にゲームの顔が見えること**。
いまの駒絵は十分きれいだが、512px・黒背景の正方形なのでポスターの主役には足りない。
下のファイルを `client/public/assets/ui/` に置くと、コード側で自動的に使います（無い間はCSSと既存の大将絵で表示します）。

形式は **PNG（透過）** か **WebP**。色は夜・金・朱で、駒絵のタッチに合わせてください。

## 最優先（これだけで印象が変わる）

| ファイル名 | サイズ目安 | 内容 |
|---|---|---|
| `title-bg.webp` | 1920×1080（横）と、可能なら 1080×1920（縦）のうち大きい方。正方形 1920×1920 でも可 | **夜のキービジュアル**。満月、霧、鳥居や盤が霞む夜。人物は描き込まない（大将立ち絵を重ねるため）。中央〜下は暗く、ロゴとボタンが読める余白 |
| `title-logo.webp` | 幅 1600px 前後、高さは文字に合わせる。背景透過 | **『百鬼盤』のロゴ**。金の筆文字 or 明朝の飾り文字。英語版は後で `title-logo-en.webp` でも可。まずは日本語だけでよい |
| `title-kyubi.png` | 高さ 1800–2400px、幅は構図任せ。**背景透過** | 九尾の狐の**全身立ち絵**。現行 `kyubi.webp` と同じキャラ・衣装で、顔が小さくならないこと |
| `title-shuten.png` | 同上 | 酒呑童子の全身立ち絵 |
| `title-nurarihyon.png` | 同上 | ぬらりひょんの全身立ち絵 |

立ち絵3枚が来たら、タイトルの大将表示を駒画像から差し替えます。

## 次に欲しい（ストア画面・対戦スクショ用）

| ファイル名 | サイズ目安 | 内容 |
|---|---|---|
| `title-moon.webp` | 1024×1024 透過 | 描き込みのある月。霧と金の暈 |
| `battle-stage.webp` | 1920×1080 | **対局の舞台**。5×6の盤が乗っている夜の祭壇／結界。盤のマスは空でよい（コード側で駒を載せる） |
| `gacha-gate.webp` | 1080×1080 透過 | 召喚の結界・月輪。ガチャ画面の中央に置く |
| `og-cover.webp` | 1200×630 | SNS / OGP。ロゴ＋大将1体＋「百鬼盤」。今は九尾の駒絵を流用している |

## まだ急がない

- メニューアイコン（召・陣・録・冠）
- チケット／妖力の専用アイコン
- リザルト用の勝ち／負け背景
- ローディングの大きな紋

## いらないもの

- UIのボタン枠を全部イラストにする必要はない（コードで組む）
- 全56体の新規立ち絵は今は不要。タイトル用の大将3体が先
- 既存駒絵の描き直しも今は不要（盤上・図鑑はそのまま使う）

## 渡し方

ファイル名を上の表どおりにして、このチャットに添付するか `client/public/assets/ui/` へ入れてください。透過PNGが最も使いやすいです。

## 画像生成プロンプト

現行の駒絵は ChatGPT の GPT Images で作っている。同じツールなら、**必ず既存の駒画像を参照として添付**すること。英語モデル（Flux / Midjourney 等）なら英語プロンプトを使う。

共通の画風（全プロンプトの先頭に付ける）:

```
High-end Japanese dark-fantasy game illustration, Cygames-like premium card art, chibi-SD proportions with painterly ultra-detailed rendering, clean silhouette, ornate gold metalwork, night palette of indigo, crimson, gold and foxfire blue, dramatic rim light, no photorealism, no western cartoon, no 3D render, no watermark, no UI, no extra text.
```

ネガティブ（対応しているツールなら）:

```
photorealistic, real person, 3D CGI, low detail, messy anatomy, extra limbs, extra tails, extra horns, blurry, watermark, signature, logo, English letters, UI, frame, card border, white background, bright daylight, cute baby face, horror gore
```

透過が欲しい立ち絵は、まず **純黒背景 `#000000`** で出し、あとで黒を抜く方が安定する。ツールが透過PNGを出せるなら「transparent background」を足す。

### 1. タイトル背景 `title-bg`（人物なし）

サイズ: 16:9（1920×1080）を先に。スマホ用に 9:16 でもう一枚あるとよい。

```
Empty cinematic title background for a Japanese yokai board-game, NO characters, NO people, NO animals, NO faces.
A huge ancient full moon glowing gold-white in a deep indigo night sky, thin gold clouds, drifting purple mist over a deserted shrine approach.
Far below, a faintly glowing 5x6 wooden game board like a ritual altar, torii gate silhouettes left and right, fallen maple leaves, foxfire wisps, gold dust in the air.
Lower third is much darker so UI text can sit on it. Center kept relatively clear for a character overlay later.
Ultra-detailed environment painting, cinematic lighting, 16:9, --no people, --no text
```

日本語（ChatGPT向け）:

```
人物・顔・動物は絶対に描かない。日本の妖怪ゲームのタイトル背景だけ。
深い藍の夜空に巨大な満月。金の薄い雲、紫の霧。遠くに鳥居のシルエット。画面下部に儀式の祭壇のような5×6の将棋盤が小さく霞んで光っている。狐火の粉。
下1/3はロゴとボタンを載せるためかなり暗い。中央は後からキャラを重ねるので空いていてよい。
高精細な環境イラスト。テキスト・ロゴ・UIは入れない。16:9。
```

### 2. ロゴ `title-logo`

日本語ロゴは生成AIが崩しやすい。崩れたら飾り金具だけ生成し、文字は別途載せる。

```
A single game-title emblem, transparent or pure black background.
The Japanese calligraphy 百鬼盤 as ornate gold leaf brush lettering, slightly weathered metal, thin crimson inner stroke, fox-mask and nine-tail motifs woven into the strokes, premium mobile-game logo, centered, no other words, no English, no subtitle, high resolution, isolated.
```

日本語:

```
背景は透過、または純黒。ゲームタイトルロゴだけ。
「百鬼盤」の3文字を金箔の筆文字・金属ロゴとして。朱の細い内側線。九尾や狐面の飾りを文字に絡める。
他の文字・英語・キャッチコピーは禁止。中央配置。
```

文字が「百」「鬼」「盤」になっていない画像は捨てる。

### 3. 九尾の狐 `title-kyubi`（参照: `client/public/assets/pieces/kyubi.webp`）

ChatGPT: 既存の `kyubi.webp` を添付してから。

```
Same character as the reference, do not redesign her.
Full-body standing pose, feet visible, taller vertical canvas, isolated on pure black background.
Nine-tailed fox shrine maiden girl, chibi-SD but elegant, long white hair, white fox ears, gold amber eyes, red markings under eyes, nine huge cream-gold tails fanned behind her, small kitsune mask on her head.
White-red-gold layered kimono, purple-gold obi with fox-head buckle, red cords, golden bells, foxfire-blue flame orb in her right hand shaped like a fox face.
Keep the same face, costume, colors and accessories. More full-body and taller than the reference, not a bust crop.
No extra characters, no background scenery, no text.
```

### 4. 酒呑童子 `title-shuten`（参照: `shuten.webp`）

```
Same character as the reference, do not redesign him.
Full-body standing pose, feet visible, taller vertical canvas, isolated on pure black background.
Red-skinned oni warlord, chibi-SD powerful build, spiky black ponytail, curved red horns with gold bands, glowing yellow eyes, fangs.
Dark ornate robes, giant black prayer beads, gold oni-mask belt buckle, purple-red ropes, golden bells.
Spiked black kanabo club on his right shoulder, large dark sake gourd in his left hand.
Purple-magenta spirit flames and two small flaming skull wisps.
Keep the same face, costume, colors and props. No extra characters, no scenery, no text.
```

### 5. ぬらりひょん `title-nurarihyon`（参照: `nurarihyon.webp`）

```
Same character as the reference, do not redesign him.
Full-body standing pose, feet visible, taller vertical canvas, isolated on pure black background.
Elderly yokai overlord, extremely elongated bald forehead, thin white goatee, knowing smirk, chibi-SD but tall silhouette.
Deep purple-black-navy layered hakama robes with gold cloud and wave embroidery, purple tassels, gold charms.
Long kiseru pipe, dark gold-pattern sake flask, tall staff with ornate gold head.
White smoke swirls and two small round white spirit wisps near his head.
Keep the same face, costume, colors and props. No extra characters, no scenery, no text.
```

### 6. 月 `title-moon`

```
A single painted full moon for a yokai game UI, circular, isolated on pure black.
Antique gold-cream moon with faint crater markings, thin gold filigree around the rim, purple mist clinging to the lower edge, soft foxfire glow, no face on the moon, no characters, no text.
```

### 7. 対局ステージ `battle-stage`

```
Top-down three-quarter view of a ritual game board stage, no characters.
A floating 5-by-6 square wooden shogi-like board, empty squares, gold inlay lines, sitting on a dark stone altar above a night abyss.
Purple-gold summoning circle under the board, drifting mist, moon glow from above, cinematic environment painting, 16:9, no pieces on the board, no text, no UI.
```

### 8. 召喚結界 `gacha-gate`

```
A circular yokai summoning gate, isolated on pure black or transparent.
Concentric gold and violet magic rings, moon motifs, foxfire particles, Japanese sacred rope and bells, looking like a gacha portal, no character in the center (keep the middle empty), no text.
```

### 9. OGP `og-cover`（1200×630）

背景と九尾が揃ってから合成するのが安全。一枚で出すなら:

```
Cinematic 1200x630 game key art banner, Japanese yokai board game.
The nine-tailed fox girl from the reference stands on the right third, full body, looking toward camera.
Left side dark empty space for a logo. Giant moon behind her, night shrine mist, gold dust.
No title text, no English, no UI. 16:9 wide banner crop.
```

文字の「百鬼盤」は後から載せる。
