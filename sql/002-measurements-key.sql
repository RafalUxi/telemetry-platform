ALTER TABLE measurements DROP CONSTRAINT IF EXISTS measurements_pkey RESTRICT;
ALTER TABLE measurements ADD  CONSTRAINT measurements_pkey PRIMARY KEY (device_id, device_ts, boot_id, seq);