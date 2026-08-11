import { DISCORD_COMMUNITY_NAME, DISCORD_INVITE_URL } from './community';

export type AnnouncementType = 'update' | 'maintenance' | 'campaign';
export type AnnouncementPriority = 'normal' | 'high';

export interface Announcement {
  id: string;
  type: AnnouncementType;
  title: string;
  body: string;
  titleEn?: string;
  bodyEn?: string;
  publishedAt: string;
  priority: AnnouncementPriority;
  showUntil?: string;
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: '2026-08-02-discord-community',
    type: 'campaign',
    title: '公式Discordコミュニティを開設しました',
    titleEn: 'The Official Discord Community Is Open',
    body: [
      `${DISCORD_COMMUNITY_NAME} を開設しました。`,
      '',
      '対戦募集、土曜対戦会の告知、編成の相談、不具合報告などにご利用ください。',
      '毎日20:00〜22:00（逢魔が時）は対戦が集まりやすい時間です。Discordでも同じ時間帯で募集しています。',
      '',
      '参加は任意です。ゲームはそのままブラウザだけで遊べます。',
      DISCORD_INVITE_URL,
    ].join('\n'),
    bodyEn: [
      'NIT GAMES | Yokai Shogi is now open.', '',
      'Use it to find opponents, follow Saturday Battle announcements, discuss formations, and report bugs.',
      'The busiest battle hours are 20:00–22:00 JST daily, and players also gather on Discord then.', '',
      'Joining is optional. You can continue playing entirely in your browser.', DISCORD_INVITE_URL,
    ].join('\n'),
    publishedAt: '2026-08-02T20:00:00+09:00',
    priority: 'high',
    showUntil: '2026-09-30T23:59:59+09:00',
  },
  {
    id: '2026-08-01-new-pieces-gift',
    type: 'campaign',
    title: '新妖怪追加記念！ガチャチケット🎟50枚配布',
    titleEn: 'New Yokai Celebration: 50 Summon Tickets',
    body: '新妖怪6体の追加を記念して、ガチャチケット50枚をプレゼントします。オンボーディング完了後の起動時に自動で付与されます（お一人様1回）。枕返し・燐火・釣瓶落とし・不知火・煙々羅・隱神刑部をガチャで狙ってみてください。',
    bodyEn: 'To celebrate six new yokai, every player receives 50 summon tickets once after completing onboarding. Try summoning Makuragaeshi, Rinka, Tsurube-otoshi, Shiranui, Enenra, and Inugami Gyobu.',
    publishedAt: '2026-08-01T14:40:00+09:00',
    priority: 'high',
    showUntil: '2026-09-01T23:59:59+09:00',
  },
  {
    id: '2026-08-01-hunger-ember-pieces',
    type: 'update',
    title: 'ゲーム性改善：飢餓の夜と新妖怪6体を追加',
    titleEn: 'Gameplay Update: Night of Hunger and Six New Yokai',
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
    bodyEn: [
      'We added a new rule and six yokai to discourage overly defensive repetition.', '',
      '[Night of Hunger]',
      'After eight moves without a capture, both sides lose 50 HP after every move. A capture resets the count.', '',
      '[New Yokai]',
      '• Makuragaeshi (R/Trick): returns to its original square after capturing',
      '• Rinka (R/Support): leaves a healing spirit flame on the captured square',
      '• Tsurube-otoshi (R/Attack): leaves a pit on the captured square',
      '• Shiranui (SR/Attack): leaves a damage-boosting flame on the captured square',
      '• Enenra (SR/Trick): may escape to an adjacent empty square after capturing',
      '• Inugami Gyobu (SSR/Trick): may stay, return, or escape after capturing', '',
      'All are available from summons and documented in the Compendium. A one-time gift of 50 tickets is also available.',
    ].join('\n'),
    publishedAt: '2026-08-01T12:50:00+09:00',
    priority: 'high',
    showUntil: '2026-09-01T23:59:59+09:00',
  },
  {
    id: '2026-07-24-hyakki-frontier',
    type: 'update',
    title: 'ソロを百鬼夜行の連戦施設に刷新しました',
    titleEn: 'Solo Mode Is Now the Night Parade Challenge',
    body: 'ソロ対戦は「百鬼夜行」一本になりました。ロビーで現在の連勝・今週ベストを確認し、次の軍勢を見てから開戦できます。勝利後は続けて挑むかロビーへ退くかを選べます。通常戦や難易度選択はなくなり、連勝はこれまでどおり週間ランキングの対象です。',
    bodyEn: 'Solo play is now centered on Night Parade. Check your current and weekly-best streak, preview the next army, then battle. After a win, continue or return to the lobby. Streaks still count toward the weekly rankings.',
    publishedAt: '2026-07-24T21:00:00+09:00',
    priority: 'high',
    showUntil: '2026-08-24T23:59:59+09:00',
  },
  {
    id: '2026-07-19-random-match-anytime',
    type: 'update',
    title: 'ランダムマッチをいつでも利用できるようにしました',
    titleEn: 'Random Matchmaking Is Now Always Available',
    body: 'オンライン対戦のランダムマッチは、これまで逢魔が時（毎日20:00〜22:00）のみでしたが、いつでもキューに入れるようになりました。対戦相手が集まりやすい時間はこれまでどおり20:00〜22:00です。土曜の逢魔が時は土曜対戦会として報酬が増え、限定妖怪の初回入手もあります。待ち時間が長いときはAI対戦への切り替えもご利用ください。',
    bodyEn: 'You can now enter the random-match queue at any time. The busiest hours remain 20:00–22:00 JST. Saturday Battle events offer larger rewards and a first-time exclusive yokai. You can switch to an AI battle if the wait is long.',
    publishedAt: '2026-07-19T11:00:00+09:00',
    priority: 'high',
    showUntil: '2026-08-19T23:59:59+09:00',
  },
  {
    id: '2026-07-19-hyakki-hasha-kyubi',
    type: 'campaign',
    title: '百鬼夜行ランキング1位に「覇者・九尾」を授与',
    titleEn: 'Night Parade #1 Receives Champion · Nine-Tails',
    body: '百鬼夜行の週間連勝ランキングで先週1位になったプレイヤーへ、限定異装「覇者・九尾」を自動で授与します。性能は九尾の狐と同じ見た目専用の異装で、ガチャでは排出されません。既に所持している場合は追加付与はありません。月曜4:00の週替わり後に配布されます。',
    bodyEn: 'Last week’s #1 Night Parade player automatically receives the exclusive Champion · Nine-Tails alt. It has the same stats as Nine-Tailed Fox and cannot be summoned. It is granted after the weekly reset at 04:00 JST on Monday, once per account.',
    publishedAt: '2026-07-19T10:00:00+09:00',
    priority: 'high',
    showUntil: '2026-08-19T23:59:59+09:00',
  },
  {
    id: '2026-07-18-release-gift',
    type: 'campaign',
    title: 'リリース記念！ガチャチケット🎟100枚配布',
    titleEn: 'Launch Celebration: 100 Summon Tickets',
    body: 'オンライン公開を記念して、ガチャチケット100枚をプレゼントします。オンボーディング完了後の起動時に自動で付与されます（お一人様1回）。あわせてがしゃどくろ・宿儺をはじめ妖怪駒13体を追加しました。ガチャや駒一覧から能力を確認できます。',
    bodyEn: 'To celebrate the online launch, every player receives 100 summon tickets once after onboarding. Thirteen yokai, including Gashadokuro and Sukuna, were also added. See their abilities in Summon and the Compendium.',
    publishedAt: '2026-07-18T09:00:00+09:00',
    priority: 'high',
    showUntil: '2026-08-18T23:59:59+09:00',
  },
  {
    id: '2026-07-10-rewarded-ads',
    type: 'campaign',
    title: 'ガチャ画面で広告視聴ボーナスを準備中です',
    titleEn: 'Optional Ad Rewards Are in Development',
    body: 'ガチャ画面から任意で広告を視聴すると、チケットを受け取れる機能を準備しています。見なくても遊べます。1日2回までの予定です。配信開始は準備が整い次第お知らせします。利用規約・プライバシーポリシーは先に更新しています。',
    bodyEn: 'We are preparing an optional feature that grants a ticket for watching an ad from the Summon screen, up to twice daily. Ads are never required to play. We will announce when it becomes available.',
    publishedAt: '2026-07-10T15:30:00+09:00',
    priority: 'high',
    showUntil: '2026-07-31T23:59:59+09:00',
  },
  {
    id: '2026-07-10-rules-guide-refresh',
    type: 'update',
    title: '遊び方を現在のルールに合わせて更新しました',
    titleEn: 'How to Play Has Been Updated',
    body: '遊び方を基本ルール中心に整理し、駒ごとのSSR特性や覚醒技、因縁は駒一覧・駒詳細で確認できるようにしました。百鬼夜行ランキング、逢魔が時報酬、土曜対戦会、ガチャと編成の案内も更新しています。',
    bodyEn: 'How to Play now focuses on the core rules. Check the Compendium for SSR traits, awakenings, and resonances. Guidance for Night Parade rankings, event rewards, Saturday Battles, summons, and formations was also updated.',
    publishedAt: '2026-07-10T09:00:00+09:00',
    priority: 'high',
    showUntil: '2026-07-24T23:59:59+09:00',
  },
  {
    id: '2026-07-10-awaken-resonance-guide',
    type: 'update',
    title: '覚醒と共鳴を活かした編成が重要になりました',
    titleEn: 'Build Around Awakenings and Resonances',
    body: '駒の取り合いで覚醒ゲージをため、盤上のSSRを1局1回だけ強化できます。さらに酒呑童子×茨木童子、九尾の狐×玉藻前などの因縁共鳴は、異装を含めて同じ組み合わせとして発動します。駒一覧と編成で相性を確認してみてください。',
    bodyEn: 'Captures fill the awakening gauge, letting you empower one SSR once per battle. Resonances such as Shuten-doji with Ibaraki-doji and Nine-Tailed Fox with Tamamo-no-Mae also work with their alternate forms.',
    publishedAt: '2026-07-10T08:50:00+09:00',
    priority: 'high',
    showUntil: '2026-07-24T23:59:59+09:00',
  },
  {
    id: '2026-07-05-hyakki-weekly-ranking',
    type: 'update',
    title: '百鬼夜行の週間連勝ランキングが始まりました',
    titleEn: 'Weekly Night Parade Rankings Have Begun',
    body: '百鬼夜行の週間ベスト連勝数をオンラインランキングで競えます。連勝はサーバーに記録され、途中でページを閉じても続きから挑戦できます。ランキングは毎週月曜4:00にリセットされ、先週のTOP3はランキング画面に掲示されます。名を刻む前にプレイヤーネームの設定をお忘れなく！',
    bodyEn: 'Compete for the best weekly Night Parade streak. Progress is stored on the server so you can continue after closing the page. Rankings reset Mondays at 04:00 JST, and last week’s top three remain displayed.',
    publishedAt: '2026-07-05T00:00:00+09:00',
    priority: 'high',
  },
  {
    id: '2026-07-04-hyakki-nurarihyon-event',
    type: 'campaign',
    title: '毎週土曜の逢魔が時に限定妖怪が登場',
    titleEn: 'An Exclusive Yokai Appears Every Saturday',
    body: 'ぬらりひょんの色違い「百鬼夜行・ぬらりひょん」が登場しました。毎週土曜の逢魔が時（20:00〜22:00）にランダムマッチを1局完走すると、勝敗に関係なく初回のみ確定で入手できます。さらに参加報酬としてガチャチケット🎟+2も獲得できます（1日1回）。',
    bodyEn: 'Complete one random match during the Saturday event (20:00–22:00 JST) to receive Night Parade · Nurarihyon the first time, regardless of the result. You also earn two participation tickets once that day.',
    publishedAt: '2026-07-04T00:00:00+09:00',
    priority: 'high',
  },
  {
    id: '2026-06-28-new-pieces-c93015c',
    type: 'update',
    title: '新しい妖怪駒を追加しました',
    titleEn: 'New Yokai Added',
    body: 'からかさ小僧、提灯お化け、獏、八岐大蛇の4体を追加しました。ガチャや駒一覧から能力を確認できます。',
    bodyEn: 'Karakasa-kozo, Chochin-obake, Baku, and Yamata-no-Orochi have been added. Check their abilities in Summon or the Compendium.',
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
