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
    body: 'ソロ対戦の連戦モード（難易度・上級）で、週間ベスト連勝数のオンラインランキングを開始しました。連勝はサーバーに記録され、途中でページを閉じても続きから挑戦できます。ランキングは毎週月曜4:00にリセットされ、先週のTOP3はソロ対戦画面に掲示されます。名を刻む前にプレイヤーネームの設定をお忘れなく！',
    publishedAt: '2026-07-05T00:00:00+09:00',
    priority: 'high',
  },
  {
    id: '2026-07-04-hyakki-nurarihyon-event',
    type: 'campaign',
    title: '毎週土曜の逢魔が時に限定妖怪が登場',
    body: 'ぬらりひょんの色違い「百鬼夜行ぬらりひょん」が登場しました。毎週土曜の逢魔が時（20:00〜22:00）にランダムマッチを1局完走すると、勝敗に関係なく初回のみ確定で入手できます。さらに参加報酬としてガチャチケット🎟+2も獲得できます（1日1回）。',
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
