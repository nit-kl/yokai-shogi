import { currentAnnouncements } from '../../shared/announcements';
import type { Announcement } from '../../shared/announcements';
import { $ } from './util';
import { AudioSys } from './audio';
import { getLocale } from './locale';

declare const __API_URL__: string;

const READ_KEY = 'yokaiShogi.announcements.read.v1';
const POPUP_KEY = 'yokaiShogi.announcements.popup.v1';

function readSet(key: string): Set<string> {
  try {
    const value = localStorage.getItem(key);
    const parsed = value ? JSON.parse(value) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, values: Set<string>): void {
  try { localStorage.setItem(key, JSON.stringify([...values])); } catch { /* ignore */ }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(getLocale() === 'en' ? 'en-US' : 'ja-JP', { month: 'numeric', day: 'numeric' }).format(date);
}

function typeLabel(type: Announcement['type']): string {
  if (getLocale() === 'en') {
    if (type === 'maintenance') return 'Maintenance';
    if (type === 'campaign') return 'Event';
    return 'Update';
  }
  if (type === 'maintenance') return 'メンテ';
  if (type === 'campaign') return 'イベント';
  return 'アップデート';
}

/** 本文中の https URL だけを安全にリンク化する（HTMLは解釈しない） */
const HTTPS_URL_RE = /(https:\/\/[^\s<>"'`]+)/g;

function appendLinkedText(parent: HTMLElement, text: string): void {
  const parts = text.split(HTTPS_URL_RE);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('https://')) {
      const link = document.createElement('a');
      link.href = part;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = part;
      parent.appendChild(link);
      continue;
    }
    parent.appendChild(document.createTextNode(part));
  }
}

async function fetchAnnouncements(): Promise<Announcement[]> {
  if (!__API_URL__) return currentAnnouncements();
  try {
    const res = await fetch(`${__API_URL__}/v1/announcements`, { cache: 'no-store' });
    const data = await res.json().catch(() => null) as { announcements?: Announcement[] } | null;
    if (!res.ok || !Array.isArray(data?.announcements)) return currentAnnouncements();
    return data.announcements;
  } catch {
    return currentAnnouncements();
  }
}

export const AnnouncementsUI = {
  items: [] as Announcement[],
  initialized: false,

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    $('btn-announcements').onclick = () => {
      AudioSys.play('click');
      this.open();
    };
    $('btn-announcements-close').onclick = () => {
      AudioSys.play('click');
      $('modal-announcements').classList.add('hidden');
    };
    window.addEventListener('yokai-locale-change', () => {
      if (!$('modal-announcements').classList.contains('hidden')) this.renderList();
    });
  },

  async refresh(opts: { popup?: boolean } = {}): Promise<void> {
    this.items = await fetchAnnouncements();
    this.renderBadge();
    if (opts.popup && __API_URL__) this.openFirstUnreadPopup();
  },

  unreadItems(): Announcement[] {
    const read = readSet(READ_KEY);
    return this.items.filter(item => !read.has(item.id));
  },

  markRead(ids: string[]): void {
    const read = readSet(READ_KEY);
    for (const id of ids) read.add(id);
    writeSet(READ_KEY, read);
    this.renderBadge();
  },

  renderBadge(): void {
    const unread = this.unreadItems().length;
    const badge = $('announcement-badge');
    badge.textContent = unread ? String(unread) : '';
    badge.classList.toggle('hidden', unread === 0);
  },

  open(): void {
    this.renderList();
    $('modal-announcements').classList.remove('hidden');
    this.markRead(this.items.map(item => item.id));
  },

  openFirstUnreadPopup(): void {
    if (document.querySelector('.modal:not(.hidden)')) return;
    const shown = readSet(POPUP_KEY);
    const item = this.unreadItems().find(x => x.priority === 'high' && !shown.has(x.id));
    if (!item) return;
    shown.add(item.id);
    writeSet(POPUP_KEY, shown);
    this.open();
  },

  renderList(): void {
    const list = $('announcements-list');
    list.replaceChildren();
    if (this.items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'announcement-empty';
      empty.textContent = '現在お知らせはありません。';
      list.appendChild(empty);
      return;
    }
    const read = readSet(READ_KEY);
    for (const item of this.items) {
      const card = document.createElement('article');
      card.className = `announcement-card announcement-${item.type}`;
      if (!read.has(item.id)) card.classList.add('unread');

      const meta = document.createElement('div');
      meta.className = 'announcement-meta';
      const type = document.createElement('span');
      type.textContent = typeLabel(item.type);
      const date = document.createElement('time');
      date.dateTime = item.publishedAt;
      date.textContent = formatDate(item.publishedAt);
      meta.append(type, date);

      const title = document.createElement('h3');
      title.textContent = getLocale() === 'en' ? item.titleEn ?? item.title : item.title;
      const body = document.createElement('p');
      appendLinkedText(body, getLocale() === 'en' ? item.bodyEn ?? item.body : item.body);

      card.append(meta, title, body);
      list.appendChild(card);
    }
  },
};
