CREATE TABLE IF NOT EXISTS measurements(
device_id text NOT NULL,
boot_id int NOT NULL,
seq int NOT NULL,
device_ts timestamptz NOT NULL,
server_ts timestamptz NOT NULL,
temperature double precision NOT NULL,
humidity double precision NOT NULL,
PRIMARY KEY (device_id, boot_id, seq)
);