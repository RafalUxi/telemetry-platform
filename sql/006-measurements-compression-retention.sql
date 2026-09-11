--- Columnstore compression and retention for raw measurements.

--- Enable columnstore (compression) on the table.
--- Two policies: 1) compress after 7 days; 2) drop chunks older than a year.

ALTER TABLE measurements SET (
    timescaledb.enable_columnstore = true,
    timescaledb.segmentby = 'device_id',
    timescaledb.orderby= 'device_ts DESC');

CALL add_columnstore_policy('measurements', after => INTERVAL '7 days', if_not_exists => true);

SELECT add_retention_policy('measurements', drop_after => INTERVAL '1 year', if_not_exists => true);