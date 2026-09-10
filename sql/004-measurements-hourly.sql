-- Hourly rollup of measurements. One row per device per hour.
-- Lower tier of the hierarchy: a 1-hour bucket is timezone independent.
-- materialized_only = false -> the newest bucket is visible in the view.
CREATE MATERIALIZED VIEW IF NOT EXISTS measurements_hourly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT device_id,
time_bucket(INTERVAL '1 hour', device_ts) AS bucket, 
count(*) AS n, sum(temperature) AS temp_sum, sum(temperature*temperature) AS temp_sum_sq, min(temperature) AS temp_min, max(temperature) AS temp_max,
sum(humidity) AS humidity_sum, sum(humidity*humidity) AS humidity_sum_sq, min(humidity) AS humidity_min, max(humidity) AS humidity_max
FROM measurements GROUP BY device_id, bucket
WITH NO DATA;

-- Backfill in windows, oldest to newest, each window as a separate statement.
-- \timing on - psql prints how long each statement took: progress per window.
-- \gexec     - psql runs every row of the query result as its own statement, each in its own transaction (a refresh refuses a transaction block).
\timing on
SELECT format('CALL refresh_continuous_aggregate(''measurements_hourly'', %L, %L)', range_start, range_end)
FROM timescaledb_information.chunks
WHERE hypertable_name = 'measurements'
ORDER BY range_start \gexec

--- Refresh policy for the view
SELECT add_continuous_aggregate_policy(
    'measurements_hourly',
    start_offset      => INTERVAL '1 day',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '30 minutes',
    if_not_exists     => true);