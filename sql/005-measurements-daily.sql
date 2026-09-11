--- Daily rollup, built on measurements_hourly. One row per device per local day.

CREATE MATERIALIZED VIEW IF NOT EXISTS measurements_daily
WITH (timescaledb.continuous) AS
SELECT device_id,
time_bucket(INTERVAL '1 day', bucket, 'Europe/Warsaw') AS day, 
       sum(n) AS n,
       sum(temp_sum) AS temp_sum,
       sum(temp_sum_sq) AS temp_sum_sq,
       min(temp_min) AS temp_min,
       max(temp_max) AS temp_max,
       sum(humidity_sum) AS humidity_sum,
       sum(humidity_sum_sq) AS humidity_sum_sq,
       min(humidity_min) AS humidity_min,
       max(humidity_max) AS humidity_max
FROM measurements_hourly GROUP BY device_id, day;


SELECT add_continuous_aggregate_policy(
    'measurements_daily',
    start_offset      => INTERVAL '3 days',
    end_offset        => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists     => true);

ALTER MATERIALIZED VIEW IF EXISTS measurements_daily
SET (timescaledb.materialized_only = false);