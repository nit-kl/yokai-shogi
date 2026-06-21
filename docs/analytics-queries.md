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

## キュー参加・成立率・待機時間

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  COUNT_IF(blob1 = 'queue_join') AS joins,
  COUNT_IF(blob1 = 'queue_exit' AND blob2 = 'matched') AS matched_users,
  ROUND(100.0 * matched_users / NULLIF(joins, 0), 1) AS match_rate_pct,
  COUNT_IF(blob1 = 'queue_exit' AND blob2 = 'matched' AND double1 <= 30000) AS matched_within_30s,
  ROUND(100.0 * matched_within_30s / NULLIF(matched_users, 0), 1) AS matched_within_30s_pct,
  ROUND(quantile(0.5)(double1) FILTER (WHERE blob1 = 'queue_exit' AND blob2 = 'matched') / 1000.0, 1)
    AS matched_wait_p50_sec,
  ROUND(quantile(0.9)(double1) FILTER (WHERE blob1 = 'queue_exit' AND blob2 = 'matched') / 1000.0, 1)
    AS matched_wait_p90_sec
FROM yokai_shogi_metrics_production
WHERE blob1 IN ('queue_join', 'queue_exit')
GROUP BY day
ORDER BY day DESC;
```

## キュー退出理由

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  blob2 AS reason,
  COUNT(*) AS users,
  ROUND(AVG(double1) / 1000.0, 1) AS avg_wait_sec
FROM yokai_shogi_metrics_production
WHERE blob1 = 'queue_exit'
GROUP BY day, reason
ORDER BY day DESC, users DESC;
```

## 日別マッチ成立数

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  blob1 AS mode,
  COUNT(*) AS match_found
FROM yokai_shogi_metrics_production
WHERE blob1 = 'match_found'
GROUP BY day, mode
ORDER BY day DESC, mode;
```

## 日別対局終了数（理由別）

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  blob1 AS mode,
  blob2 AS reason,
  blob3 AS winner,
  COUNT(*) AS match_end
FROM yokai_shogi_metrics_production
WHERE blob1 = 'match_end'
GROUP BY day, mode, reason, winner
ORDER BY day DESC, match_end DESC;
```

## 完走率（日別・ランダムマッチ）

`match_end` が記録された対局を「完走」とみなす（途中切断も終了イベントは出る）。

```sql
WITH found AS (
  SELECT
    toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
    index1 AS match_id
  FROM yokai_shogi_metrics_production
  WHERE blob1 = 'match_found' AND blob2 = 'random'
),
ended AS (
  SELECT
    toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
    index1 AS match_id
  FROM yokai_shogi_metrics_production
  WHERE blob1 = 'match_end' AND blob2 = 'random'
)
SELECT
  f.day,
  COUNT(DISTINCT f.match_id) AS found,
  COUNT(DISTINCT e.match_id) AS ended,
  ROUND(100.0 * COUNT(DISTINCT e.match_id) / NULLIF(COUNT(DISTINCT f.match_id), 0), 1) AS completion_pct
FROM found f
LEFT JOIN ended e ON f.day = e.day AND f.match_id = e.match_id
GROUP BY f.day
ORDER BY f.day DESC;
```

## 平均対局時間（秒）

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  blob2 AS reason,
  AVG(double1) / 1000.0 AS avg_duration_sec,
  AVG(double2) AS avg_actions
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
