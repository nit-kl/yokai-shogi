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
