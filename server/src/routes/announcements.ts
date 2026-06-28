import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { currentAnnouncements } from '../../../shared/announcements';

export const announcementRoutes = new Hono<AppEnv>();

announcementRoutes.get('/announcements', c => c.json({ announcements: currentAnnouncements() }));
