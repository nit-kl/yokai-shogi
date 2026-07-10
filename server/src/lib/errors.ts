/* エラー形式の統一(doc 04)
   { "error": { "code": "...", "message": "..." } } */

import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type ErrorCode =
  | 'UNAUTHORIZED' | 'VALIDATION' | 'INSUFFICIENT_TICKETS' | 'INSUFFICIENT_YORYOKU'
  | 'INVALID_FORMATION' | 'RATE_LIMITED' | 'CONFLICT' | 'MAINTENANCE' | 'BANNED'
  | 'FEATURE_DISABLED' | 'INTERNAL';

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  UNAUTHORIZED: 401,
  VALIDATION: 400,
  INSUFFICIENT_TICKETS: 400,
  INSUFFICIENT_YORYOKU: 400,
  INVALID_FORMATION: 400,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  MAINTENANCE: 503,
  BANNED: 403,
  FEATURE_DISABLED: 403,
  INTERNAL: 500,
};

export function apiError(c: Context, code: ErrorCode, message: string) {
  return c.json({ error: { code, message } }, STATUS[code]);
}
