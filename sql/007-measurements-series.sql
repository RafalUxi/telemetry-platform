-- Measurements_series: one device, one time range, at most N points.
-- Picks the finest layer (raw, hourly, daily) that fits the point budget.

CREATE OR REPLACE FUNCTION measurements_series(d_dev_id text, d_from timestamptz, d_to timestamptz, d_points int)
RETURNS TABLE (t_s timestamptz, temp_avg_s double precision, temp_min_s double precision, temp_max_s double precision, 
humidity_avg_s double precision, humidity_min_s double precision, humidity_max_s double precision)
LANGUAGE plpgsql AS $$
DECLARE 
     v_hours  numeric := extract(epoch FROM d_to - d_from) / 3600; 
     v_mes bigint;
BEGIN
    SELECT sum(h.n) INTO v_mes
    FROM measurements_hourly h
    WHERE h.device_id = d_dev_id AND h.bucket >= d_from AND h.bucket < d_to;
    IF v_mes IS NULL THEN
    RETURN;
ELSIF v_hours > d_points THEN
    RETURN QUERY
    SELECT d.day, d.temp_sum/d.n, d.temp_min, d.temp_max, d.humidity_sum/d.n, d.humidity_min, d.humidity_max
    FROM measurements_daily d
    WHERE d.device_id = d_dev_id AND d.day >= d_from AND d.day < d_to
    ORDER BY d.day;
ELSIF v_mes > d_points THEN
    RETURN QUERY
    SELECT h.bucket, h.temp_sum/h.n, h.temp_min, h.temp_max, h.humidity_sum/h.n, h.humidity_min, h.humidity_max 
    FROM measurements_hourly h
    WHERE h.device_id = d_dev_id AND h.bucket >= d_from AND h.bucket < d_to
    ORDER BY h.bucket;
ELSE
    RETURN QUERY
    SELECT m.device_ts, m.temperature, m.temperature, m.temperature, m.humidity, m.humidity, m.humidity
    FROM measurements m
    WHERE m.device_id = d_dev_id AND m.device_ts >= d_from AND m.device_ts < d_to
    ORDER BY m.device_ts;
 END IF;
END $$;