# Telemetry platform

Telemetry acquisition from many devices: MQTT -> validation -> queue -> batched writes ->
time-series storage -> API -> dashboard. Portfolio project, deliberately scoped: hundreds of
devices, a year of data, untrusted devices that go offline, and two separate timestamps
(measured vs received) from day one.

## Status

Step 1 of 8 - infrastructure scaffolded, application code not written yet.

## Local development

Requires Docker Desktop and Node >= 20.

```bash
cp .env.example .env
docker compose up -d
docker compose ps
```

Manual broker check (needs mosquitto clients, or run them inside the container):

```bash
docker compose exec mosquitto mosquitto_sub -t 'telemetry/#' -v
```

Tear down, keeping the data volumes:

```bash
docker compose down
```

## Layout

```
docker-compose.yml   broker + database + queue backend
mosquitto/           broker config (credentials and ACL arrive in step 3)
src/                 application code
docs/adr/            architecture decision records
```
