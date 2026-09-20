import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const FORMATION = '[["ittan","kooni",null,"nekomata","nue"],["tengu","kappa","kyubi","nurikabe","rokuro"]]';

function migrationQueries(name: string): string[] {
  const migration = env.TEST_MIGRATIONS.find(item => item.name.includes(name));
  if (!migration) throw new Error(`migration not found: ${name}`);
  return migration.queries;
}

async function seedMatchWithActions() {
  const pId = crypto.randomUUID();
  const eId = crypto.randomUUID();
  const matchId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, is_guest, status) VALUES (?1, 0, \'active\')').bind(pId),
    env.DB.prepare('INSERT INTO users (id, is_guest, status) VALUES (?1, 0, \'active\')').bind(eId),
    env.DB.prepare('INSERT INTO user_profiles (user_id, name, formation) VALUES (?1, ?2, ?3)')
      .bind(pId, '先手', FORMATION),
    env.DB.prepare('INSERT INTO user_profiles (user_id, name, formation) VALUES (?1, ?2, ?3)')
      .bind(eId, '後手', FORMATION),
    env.DB.prepare(
      `INSERT INTO matches (
        id, mode, p_user_id, e_user_id, p_formation, e_formation,
        winner, reason, rng_seed, rule_version, started_at, ended_at
      ) VALUES (?1, 'friend', ?2, ?3, ?4, ?4, 'p', 'resign', 'seed', 'test', '2026-09-20T00:00:00Z', '2026-09-20T00:01:00Z')`,
    ).bind(matchId, pId, eId, FORMATION),
    env.DB.prepare(
      'INSERT INTO match_actions (match_id, seq, side, action, events) VALUES (?1, 1, \'p\', \'{}\', \'[]\')',
    ).bind(matchId),
  ]);

  return { pId, eId, matchId };
}

describe('D1 migrations', () => {
  it('対局ログがある状態で matches を DROP すると外部キー違反になる', async () => {
    await seedMatchWithActions();
    await expect(env.DB.prepare('DROP TABLE matches').run()).rejects.toThrow(/FOREIGN KEY|SQLITE_CONSTRAINT/i);
  });

  it('0010 は対局ログがある状態でも matches を再作成できる', async () => {
    const { pId, eId, matchId } = await seedMatchWithActions();
    const queries = migrationQueries('0010_shadow_matches').map(query => env.DB.prepare(query));
    await env.DB.batch(queries);

    const match = await env.DB.prepare('SELECT id, mode, p_user_id, e_user_id FROM matches WHERE id = ?1')
      .bind(matchId)
      .first<{ id: string; mode: string; p_user_id: string; e_user_id: string }>();
    expect(match).toEqual({ id: matchId, mode: 'friend', p_user_id: pId, e_user_id: eId });

    const actions = await env.DB.prepare('SELECT COUNT(*) AS count FROM match_actions WHERE match_id = ?1')
      .bind(matchId)
      .first<{ count: number }>();
    expect(actions?.count).toBe(1);

    const shadow = await env.DB.prepare('SELECT name FROM user_profiles WHERE user_id = ?1')
      .bind('u_shadow')
      .first<{ name: string }>();
    expect(shadow?.name).toBe('AIの対戦相手');

    await env.DB.prepare(
      `INSERT INTO matches (
        id, mode, p_user_id, e_user_id, p_formation, e_formation,
        rng_seed, rule_version, started_at
      ) VALUES ('m_shadow_ok', 'shadow', ?1, 'u_shadow', ?2, ?2, 'seed', 'test', '2026-09-20T00:02:00Z')`,
    ).bind(pId, FORMATION).run();
  });
});
