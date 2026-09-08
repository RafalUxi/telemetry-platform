SELECT create_hypertable('measurements', by_range('device_ts', INTERVAL '7 day'), migrate_data => true, if_not_exists => true);
ANALYZE measurements;