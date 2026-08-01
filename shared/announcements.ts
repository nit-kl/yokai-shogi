export type AnnouncementType = 'update' | 'maintenance' | 'campaign';
export type AnnouncementPriority = 'normal' | 'high';

export interface Announcement {
  id: string;
  type: AnnouncementType;
  title: string;
  body: string;
  publishedAt: string;
  priority: AnnouncementPriority;
  showUntil?: string;
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: '2026-08-01-new-pieces-gift',
    type: 'campaign',
    title: '新妖怪追加記念！ガチャチケット🎟50枚配布',
    body: '新妖怪6体の追加を記念して、ガチャチケット50枚をプレゼントします。オンボーディング完了後の起動時に自動で付与されます（お一人様1回）。枕返し・燐火・釣瓶落とし・不知火・煙々羅・隱神刑部をガチャで狙ってみてください。',
    publishedAt: '2026-08-01T14:40:00+09:00',
    priority: 'high',
    showUntil: '2026-09-01T23:59:59+09:00',
  },
  {
    id: '2026-08-01-hunger-ember-pieces',
    type: 'update',
    title: 'ゲーム性改善：飢餓の夜と新妖怪6体を追加',
    body: [
      '守り合い・往復が続きにくくなるよう、ルールと新駒を追加しました。',
      '',
      '【飢餓の夜】',
      '双方あわせて8手駒を取らないと「飢餓の夜」が始まり、その後は毎手お互いの魂力が50ずつ減ります。駒を取るとカウントがリセットされます。',
      '',
      '【新妖怪】',
      '・枕返し（R／化）…取ったあと自動で元マスへ戻る「帰影」',
      '・燐火（R／援）…取ったマスに回復の燐火を残す',
      '・釣瓶落とし（R／攻）…取ったマスに落とし穴を残す',
      '・不知火（SR／攻）…取ったマスに攻撃強化の残火を残す',
      '・煙々羅（SR／化）…取ったあと隣の空きマスへ逃げられる',
      '・隱神刑部（SSR／化）…取ったあと、その場／元マスへ戻る／隣へ逃げるを選べる',
      '',
      'いずれもガチャから入手できます。能力は駒一覧からも確認してください。',
      '記念としてガチャチケット50枚も配布中です（お一人様1回）。',
    ].join('\n'),
    publishedAt: '2026-08-01T12:50:00+09:00',
    priority: 'high',
    showUntil: '2026-09-01T23:59:59+09:00',
  },
  {
    id: '2026-07-24-hyakki-frontier',
    type: 'update',
    title: 'ソロを百鬼夜行の連戦施設に刷新しました',
    body: 'ソロ対戦は「百鬼夜行」一本になりました。ロビーで現在の連勝・今週ベストを確認し、次の軍勢を見てから開戦できます。勝利後は続けて挑むかロビーへ退くかを選べます。通常戦や難易度選択はなくなり、連勝はこれまでどおり週間ランキングの対象です。',
    publishedAt: '2026-07-24T21:00:00+09:00',
    priority: 'high',
    showUntil: '2026-08-24T23:59:59+09:00',
  },
  {
    id: '2026-07-19-random-match-anytime',
    type: 'update',
    title: 'ランダムマッチをいつでも利用できるようにしました',
    body: 'オンライン対戦のランダムマッチは、これまで逢魔が時（毎日20:00〜22:00）のみでしたが、いつでもキューに入れるようになりました。対戦相手が集まりやすい時間はこれまでどおり20:00〜22:00です。土曜の逢魔が時は土曜対戦会として報酬が増え、限定妖怪の初回入手もあります。待ち時間が長いときはAI対戦への切り替えもご利用ください。',
    publishedAt: '2026-07-19T11:00:00+09:00',
    priority: 'high',
    showUntil: '2026-08-19T23:59:59+09:00',
  },
  {
    id: '2026-07-19-hyakki-hasha-kyubi',
    type: 'campaign',
    title: '百鬼夜行ランキング1位に「覇者・九尾」を授与',
    body: '百鬼夜行の週間連勝ランキングで先週1位になったプレイヤーへ、限定異装「覇者・九尾」を自動で授与します。性能は九尾の狐と同じ見た目専用の異装で、ガチャでは排出されません。既に所持している場合は追加付与はありません。月曜4:00の週替わり後に配布されます。',
    publishedAt: '2026-07-19T10:00:00+09:00',
    priority: 'high',
    showUntil: '2026-08-19T23:59:59+09:00',
  },
  {
    id: '2026-07-18-release-gift',
    type: 'campaign',
    title: 'リリース記念！ガチャチケット🎟100枚配布',
    body: 'オンライン公開を記念して、ガチャチケット100枚をプレゼントします。オンボーディング完了後の起動時に自動で付与されます（お一人様1回）。あわせてがしゃどくろ・宿儺をはじめ妖怪駒13体を追加しました。ガチャや駒一覧から能力を確認できます。',
    publishedAt: '2026-07-18T09:00:00+09:00',
    priority: 'high',
    showUntil: '2026-08-18T23:59:59+09:00',
  },
  {
    id: '2026-07-10-rewarded-ads',
    type: 'campaign',
    title: 'ガチャ画面で広告視聴ボーナスを準備中です',
    body: 'ガチャ画面から任意で広告を視聴すると、チケットを受け取れる機能を準備しています。見なくても遊べます。1日2回までの予定です。配信開始は準備が整い次第お知らせします。利用規約・プライバシーポリシーは先に更新しています。',
    publishedAt: '2026-07-10T15:30:00+09:00',
    priority: 'high',
    showUntil: '2026-07-31T23:59:59+09:00',
  },
  {
    id: '2026-07-10-rules-guide-refresh',
    type: 'update',
    title: '遊び方を現在のルールに合わせて更新しました',
    body: '遊び方を基本ルール中心に整理し、駒ごとのSSR特性や覚醒技、因縁は駒一覧・駒詳細で確認できるようにしました。百鬼夜行ランキング、逢魔が時報酬、土曜対戦会、ガチャと編成の案内も更新しています。',
    publishedAt: '2026-07-10T09:00:00+09:00',
    priority: 'high',
    showUntil: '2026-07-24T23:59:59+09:00',
  },
  {
    id: '2026-07-10-awaken-resonance-guide',
    type: 'update',
    title: '覚醒と共鳴を活かした編成が重要になりました',
    body: '駒の取り合いで覚醒ゲージをため、盤上のSSRを1局1回だけ強化できます。さらに酒呑童子×茨木童子、九尾の狐×玉藻前などの因縁共鳴は、異装を含めて同じ組み合わせとして発動します。駒一覧と編成で相性を確認してみてください。',
    publishedAt: '2026-07-10T08:50:00+09:00',
    priority: 'high',
    showUntil: '2026-07-24T23:59:59+09:00',
  },
  {
    id: '2026-07-05-hyakki-weekly-ranking',
    type: 'update',
    title: '百鬼夜行の週間連勝ランキングが始まりました',
    body: '百鬼夜行の週間ベスト連勝数をオンラインランキングで競えます。連勝はサーバーに記録され、途中でページを閉じても続きから挑戦できます。ランキングは毎週月曜4:00にリセットされ、先週のTOP3はランキング画面に掲示されます。名を刻む前にプレイヤーネームの設定をお忘れなく！',
    publishedAt: '2026-07-05T00:00:00+09:00',
    priority: 'high',
  },
  {
    id: '2026-07-04-hyakki-nurarihyon-event',
    type: 'campaign',
    title: '毎週土曜の逢魔が時に限定妖怪が登場',
    body: 'ぬらりひょんの色違い「百鬼夜行・ぬらりひょん」が登場しました。毎週土曜の逢魔が時（20:00〜22:00）にランダムマッチを1局完走すると、勝敗に関係なく初回のみ確定で入手できます。さらに参加報酬としてガチャチケット🎟+2も獲得できます（1日1回）。',
    publishedAt: '2026-07-04T00:00:00+09:00',
    priority: 'high',
  },
  {
    id: '2026-06-28-new-pieces-c93015c',
    type: 'update',
    title: '新しい妖怪駒を追加しました',
    body: 'からかさ小僧、提灯お化け、獏、八岐大蛇の4体を追加しました。ガチャや駒一覧から能力を確認できます。',
    publishedAt: '2026-06-28T12:41:47+09:00',
    priority: 'high',
    showUntil: '2026-07-12T23:59:59+09:00',
  },
];

export function currentAnnouncements(now = new Date()): Announcement[] {
  return ANNOUNCEMENTS
    .filter(item => !item.showUntil || new Date(item.showUntil).getTime() >= now.getTime())
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}
