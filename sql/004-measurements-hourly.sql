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