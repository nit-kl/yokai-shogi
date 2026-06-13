# Analytics Engine 確認クエリ (Phase 2)

データセット: `yokai_shogi_metrics_production` / `yokai_shogi_metrics_staging`

イベントは `server/src/do/` から `METRICS.writeDataPoint` で記録する。

| blob[0] | 意味 | blob[1..] | doubles | indexes[0] |
|---|---|---|---|---|
| `match_found` | マッチ成立 | mode (`random` / `friend`) | `[1]` | matchId |
| `match_end` | 対局終了 | mode, reason, winner | `[durationMs, actionCount]` | matchId |

Cloudflareダッシュボード → Analytics Engine → SQL で実行する。

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
