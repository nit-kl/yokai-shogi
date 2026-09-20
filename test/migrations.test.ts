import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('0010 は D1 で有効な defer_foreign_keys で matches を再作成する', () => {
  const sql = readFileSync('server/migrations/0010_shadow_matches.sql', 'utf8')
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
  expect(sql).toMatch(/PRAGMA\s+defer_foreign_keys\s*=\s*ON/i);
  expect(sql).not.toMatch(/PRAGMA\s+foreign_keys\s*=\s*OFF/i);
  expect(sql).toMatch(/DROP TABLE matches/);
  expect(sql).toMatch(/mode IN \('random', 'friend', 'shadow'\)/);
});
