# タイトル用アート（任意）

このフォルダに次のファイルを置くと、タイトル画面が自動で差し替わります。
無くても起動します。

- `title-bg.webp` / `.png` / `.jpg` — 夜の背景（月と盤が描いてあってもよい）
- `title-logo.webp` / `.png` / `.jpg` — 百鬼盤ロゴ（**黒背景でも可**。起動時に黒を抜く）
- `title-kyubi.png` / `title-ibaraki.png` / `title-tamamo.png` — タイトル用立ち絵（透過）。無い間は駒絵を使う

チャットに添付しただけではリポジトリに入りません。このフォルダへ直接置いてください。

```
node scripts/import-title-art.mjs --logo ./logo.png --bg ./bg.png
```

詳細は `docs/26-visual-assets.md`。
