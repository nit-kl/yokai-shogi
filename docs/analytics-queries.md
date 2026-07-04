# Analytics Engine 確認クエリ (Phase 2)

データセット: `yokai_shogi_metrics_production` / `yokai_shogi_metrics_staging`

イベントは `server/src/do/` から `METRICS.writeDataPoint` で記録する。

| blob[0] | 意味 | blob[1..] | doubles | indexes[0] |
|---|---|---|---|---|
| `match_found` | マッチ成立 | mode (`random` / `friend`) | `[1]` | matchId |
| `match_end` | 対局終了 | mode, reason, winner | `[durationMs, actionCount]` | matchId |
| `match_failed` | 対局ルーム初期化失敗 | mode | `[1]` | なし |
| `queue_join` | ランダム待機開始 | なし | `[0, queueSize]` | userId |
| `queue_exit` | ランダム待機終了 | reason | `[waitMs, queueSize]` | userId |

Cloudflareダッシュボード → Analytics Engine → SQL で実行する。

`queue_exit` の reason は `matched`（成立）、`cancel`（手動取消）、`timeout`（AI切替）、
`disconnect`（切断）、`invalid`（ユーザーデータ不正）のいずれか。

> **構文の注意**: Analytics Engine の SQL は ClickHouse の限定サブセット。
> `FILTER (WHERE ...)`・`JOIN`・`UNION`・`WITH`(CTE)・`NULLIF` は**使えない**。
> 代わりに `countIf(<条件>)` / `sumIf` / `avgIf`、分位数は
> `quantileExactWeighted(q)(値, _sample_interval)`、ゼロ除算回避は `if()` を使う。
> （参考: developers.cloudflare.com/analytics/analytics-engine/sql-reference/）

## キュー参加・成立率

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  countIf(blob1 = 'queue_join') AS joins,
  countIf(blob1 = 'queue_exit' AND blob2 = 'matched') AS matched_users,
  countIf(blob1 = 'queue_exit' AND blob2 = 'matched' AND double1 <= 30000) AS matched_within_30s,
  round(100.0 * countIf(blob1 = 'queue_exit' AND blob2 = 'matched')
        / if(countIf(blob1 = 'queue_join') = 0, 1, countIf(blob1 = 'queue_join')), 1) AS match_rate_pct,
  round(100.0 * countIf(blob1 = 'queue_exit' AND blob2 = 'matched' AND double1 <= 30000)
        / if(countIf(blob1 = 'queue_exit' AND blob2 = 'matched') = 0, 1,
             countIf(blob1 = 'queue_exit' AND blob2 = 'matched')), 1) AS matched_within_30s_pct
FROM yokai_shogi_metrics_production
WHERE blob1 = 'queue_join' OR blob1 = 'queue_exit'
GROUP BY day
ORDER BY day DESC;
```

## 成立時の待機時間（p50 / p90）

成立（`matched`）した退出だけに絞るため、上のクエリと分けて実行する。

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  count() AS matched_users,
  round(quantileExactWeighted(0.5)(double1, _sample_interval) / 1000.0, 1) AS wait_p50_sec,
  round(quantileExactWeighted(0.9)(double1, _sample_interval) / 1000.0, 1) AS wait_p90_sec
FROM yokai_shogi_metrics_production
WHERE blob1 = 'queue_exit' AND blob2 = 'matched'
GROUP BY day
ORDER BY day DESC;
```

## キュー退出理由

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  blob2 AS reason,
  count() AS users,
  round(avg(double1) / 1000.0, 1) AS avg_wait_sec
FROM yokai_shogi_metrics_production
WHERE blob1 = 'queue_exit'
GROUP BY day, reason
ORDER BY day DESC, users DESC;
```

## 日別マッチ成立数

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  blob2 AS mode,
  count() AS match_found
FROM yokai_shogi_metrics_production
WHERE blob1 = 'match_found'
GROUP BY day, mode
ORDER BY day DESC, mode;
```

## 日別対局終了数（理由別）

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  blob2 AS mode,
  blob3 AS reason,
  blob4 AS winner,
  count() AS match_end
FROM yokai_shogi_metrics_production
WHERE blob1 = 'match_end'
GROUP BY day, mode, reason, winner
ORDER BY day DESC, match_end DESC;
```

## 完走率（日別・ランダムマッチ）

`match_end` が記録された対局を「完走」とみなす（途中切断も終了イベントは出る）。
JOIN が使えないため日別の件数比較で近似する（日付をまたいだ対局は found と end が
別の日に数えられる。厳密に突合したいときは D1 の `matches` を見る）。

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  countIf(blob1 = 'match_found') AS found,
  countIf(blob1 = 'match_end') AS ended,
  round(100.0 * countIf(blob1 = 'match_end')
        / if(countIf(blob1 = 'match_found') = 0, 1, countIf(blob1 = 'match_found')), 1) AS completion_pct
FROM yokai_shogi_metrics_production
WHERE (blob1 = 'match_found' OR blob1 = 'match_end') AND blob2 = 'random'
GROUP BY day
ORDER BY day DESC;
```

## 平均対局時間（秒）

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  blob3 AS reason,
  round(avg(double1) / 1000.0, 1) AS avg_duration_sec,
  round(avg(double2), 1) AS avg_actions
FROM yokai_shogi_metrics_production
WHERE blob1 = 'match_end'
GROUP BY day, reason
ORDER BY day DESC;
```

## D1での対局確認（補助）

Analytics と突合するときは D1 でも確認する。

```sql
SELECT id, mode, winner, reason, started_at, ended_at
FROM matches
ORDER BY started_at DESC
LIMIT 20;
```

```sql
SELECT match_id, COUNT(*) AS actions
FROM match_actions
GROUP BY match_id
ORDER BY actions DESC
LIMIT 20;
```
