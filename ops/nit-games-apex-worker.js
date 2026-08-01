/**
 * nit-games.com / www 用ポータル (AdSense 審査・案内サイト)
 * 静的ファイル: ops/apex-site/
 * デプロイ: npm run apex:deploy
 *
 * - 所有権確認済みのため adsbygoogle.js は載せない (meta + ads.txt のみ)
 * - Google クローラー向けの「全パス同一HTML」は行わない (実ページを返す)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* www → apex (コンテンツの正規URLを一本化) */
    if (url.hostname === 'www.nit-games.com') {
      url.hostname = 'nit-games.com';
      return Response.redirect(url.toString(), 301);
    }

    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  },
};
