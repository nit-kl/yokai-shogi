/**
 * nit-games.com / www 用の暫定ゲート(AdSense 所有権確認 + ゲームへ誘導)
 * デプロイ: npm run apex:deploy
 *
 * 注意: meta refresh 即時転送は AdSense クローラー確認に失敗しやすいので使わない。
 */

const GAME = 'https://yokai-shogi.nit-games.com';
const ADSENSE_CLIENT = 'ca-pub-3213960617040193';
const ADS_TXT = 'google.com, pub-3213960617040193, DIRECT, f08c47fec0942fa0\n';

function gateHtml() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>nit games — 妖怪将棋</title>
<meta name="description" content="nit games。ブラウザゲーム「妖怪将棋」を公開しています。">
<meta name="google-adsense-account" content="${ADSENSE_CLIENT}">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>
<link rel="canonical" href="https://nit-games.com/">
<style>
body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.7;color:#222}
a{color:#0b57d0}
.card{border:1px solid #ddd;border-radius:8px;padding:1.25rem;margin:1.5rem 0}
</style>
</head>
<body>
<h1>nit games</h1>
<p>個人開発のブラウザゲームを公開しています。</p>
<div class="card">
  <h2>妖怪将棋</h2>
  <p>妖怪の駒で戦う無料ブラウザ将棋ゲーム。登録なしですぐ遊べます。</p>
  <p><a href="${GAME}/"><strong>ゲームを開く（yokai-shogi.nit-games.com）</strong></a></p>
</div>
<p>
  <a href="${GAME}/legal/terms.html">利用規約</a> ·
  <a href="${GAME}/legal/privacy.html">プライバシーポリシー</a>
</p>
</body>
</html>`;
}

function isGoogleVerifier(ua) {
  return /googlebot|mediapartners-google|adsbot-google|google-adwords|apis-google/i.test(ua || '');
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const ua = request.headers.get('user-agent') || '';

    if (path === '/ads.txt') {
      return new Response(ADS_TXT, {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    /* 確認用クローラーには常にゲート HTML を返す(リダイレクトしない) */
    if (isGoogleVerifier(ua) || path === '/' || path === '') {
      return new Response(gateHtml(), {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    return Response.redirect(`${GAME}${path}${url.search}`, 302);
  },
};
