-- Measurements_series: one device, one time range, at most N points.
-- Picks the layer from the LENGTH of the window: short -> raw bucketed by time_bucket,
-- medium -> hourly rollup, long -> daily rollup.

CREATE OR REPLACE FUNCTION measurements_series(d_dev_id text, d_from timestamptz, d_to timestamptz, d_points int)
RETURNS TABLE (t_s timestamptz, temp_avg_s double precision, temp_min_s double precision, temp_max_s double precision,
humidity_avg_s double precision, humidity_min_s double precision, humidity_max_s double precision)
LANGUAGE plpgsql AS $$
DECLARE
    v_hours numeric := extract(epoch FROM d_to - d_from) / 3600;
    v_width interval := make_interval(
        secs => greatest(1, ceil(extract(epoch FROM d_to - d_from) / d_points))::int);
BEGIN
    IF v_hours <= 6 THEN
        RETURN QUERY
        SELECT time_bucket(v_width, m.device_ts),
               avg(m.temperature), min(m.temperature), max(m.temperature),
               avg(m.humidity),    min(m.humidity),    max(m.humidity)
        FROM measurements m
        WHERE m.device_id = d_dev_id AND m.device_ts >= d_from AND m.device_ts < d_to
        GROUP BY 1
        ORDER BY 1;
    ELSIF v_hours <= d_points THEN
        RETURN QUERY
        SELECT h.bucket, h.temp_sum/h.n, h.temp_min, h.temp_max,
               h.humidity_sum/h.n, h.humidity_min, h.humidity_max
        FROM measurements_hourly h
        WHERE h.device_id = d_dev_id AND h.bucket >= d_from AND h.bucket < d_to
        ORDER BY h.bucket;
    ELSE
        RETURN QUERY
        SELECT d.day, d.temp_sum/d.n, d.temp_min, d.temp_max,
               d.humidity_sum/d.n, d.humidity_min, d.humidity_max
        FROM measurements_daily d
        WHERE d.device_id = d_dev_id AND d.day >= d_from AND d.day < d_to
        ORDER BY d.day;
    END IF;
END $$;