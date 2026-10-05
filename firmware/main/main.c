// Telemetry device firmware.
//
// One physical device speaking the same wire contract as the simulator:
// a batch of samples published to devices/<device_id>/telemetry, with
// millisecond timestamps taken from the device clock.
//
// Stage 1a: prove the toolchain. No networking, no sensor.

#include "freertos/FreeRTOS.h"
#include <stdio.h>
#include "esp_chip_info.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_system.h"
#include "nvs_flash.h"
#include "esp_netif.h"
#include "esp_event.h"
#include "esp_wifi_default.h"
#include "esp_wifi.h"
#include "freertos/event_groups.h"
#include "sdkconfig.h"
#include "esp_netif_sntp.h"
#include <sys/time.h>
#include "mqtt_client.h"
#include "driver/i2c_master.h"
#include "esp_timer.h"
#include "nvs.h"
#include <string.h>
#include "esp_crt_bundle.h"

typedef struct {
    uint32_t seq;
    int64_t  mono_us;
    float    temperature;
    float    humidity;
} sample_t;

static sample_t buffer[CONFIG_BUFFER_MAX];
static size_t   buffer_count;
static uint32_t dropped_count;
static char     payload[4096];
static uint32_t boot_id;

static char wifi_ssid[33];
static char wifi_pass[65];
static char device_id[33];
static char device_pass[65];
static char broker_uri[128];


#define AHT20_ADDR 0x38

#define MQTT_CONNECTED_BIT BIT2
#define MQTT_FAILED_BIT    BIT3

#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAILED_BIT    BIT1

static const char *TAG = "device";
static EventGroupHandle_t wifi_events;
static int retry_count;

static void on_wifi_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
        return;
    }

    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        if (retry_count < CONFIG_WIFI_MAX_RETRY) {
            retry_count++;
            ESP_LOGW(TAG, "disconnected, attempt %d of %d", retry_count, CONFIG_WIFI_MAX_RETRY);
            esp_wifi_connect();
        } else {
            ESP_LOGE(TAG, "giving up after %d attempts", retry_count);
            xEventGroupSetBits(wifi_events, WIFI_FAILED_BIT);
        }
        return;
    }

    if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *) data;
        ESP_LOGI(TAG, "IP: " IPSTR, IP2STR(&event->ip_info.ip));
        retry_count = 0;
        xEventGroupSetBits(wifi_events, WIFI_CONNECTED_BIT);
    }
}

static void on_mqtt_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t) data;

    switch ((esp_mqtt_event_id_t) id) {
    case MQTT_EVENT_CONNECTED:
        ESP_LOGI(TAG, "broker connected");
        xEventGroupSetBits(wifi_events, MQTT_CONNECTED_BIT);
        break;

    case MQTT_EVENT_DISCONNECTED:
        ESP_LOGW(TAG, "broker disconnected");
        xEventGroupClearBits(wifi_events, MQTT_CONNECTED_BIT);
        break;

    case MQTT_EVENT_PUBLISHED:
        ESP_LOGI(TAG, "broker acknowledged msg_id %d", event->msg_id);
        break;

    case MQTT_EVENT_ERROR:
        ESP_LOGE(TAG, "mqtt error, connect_return_code %d",
                 event->error_handle->connect_return_code);
        xEventGroupSetBits(wifi_events, MQTT_FAILED_BIT);
        break;

    default:
        break;
    }
}

static esp_err_t aht20_read(i2c_master_dev_handle_t dev, float *temperature, float *humidity)
{
    const uint8_t trigger[3] = {0xAC, 0x33, 0x00};
    esp_err_t err = i2c_master_transmit(dev, trigger, sizeof(trigger), 200);
    if (err != ESP_OK) {
        return err;
    }

    vTaskDelay(pdMS_TO_TICKS(100));

    uint8_t raw[6];
    err = i2c_master_receive(dev, raw, sizeof(raw), 200);
    if (err != ESP_OK) {
        return err;
    }

    if (raw[0] & 0x80) {
        return ESP_ERR_TIMEOUT;
    }

    uint32_t hum_raw  = ((uint32_t) raw[1] << 12) | ((uint32_t) raw[2] << 4) | (raw[3] >> 4);
    uint32_t temp_raw = (((uint32_t) raw[3] & 0x0F) << 16) | ((uint32_t) raw[4] << 8) | raw[5];

    *humidity    = hum_raw  * 100.0f / 1048576.0f;
    *temperature = temp_raw * 200.0f / 1048576.0f - 50.0f;

    return ESP_OK;
}

static uint32_t next_boot_id(void)
{
    nvs_handle_t nvs;
    esp_err_t err = nvs_open("device", NVS_READWRITE, &nvs);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_open failed: %s", esp_err_to_name(err));
        return 0;
    }

    uint32_t value = 0;
    err = nvs_get_u32(nvs, "boot_id", &value);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        value = 0;
    } else if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_get_u32 failed: %s", esp_err_to_name(err));
        nvs_close(nvs);
        return 0;
    }

    value++;
    if (nvs_set_u32(nvs, "boot_id", value) != ESP_OK || nvs_commit(nvs) != ESP_OK) {
        ESP_LOGE(TAG, "boot_id not persisted, it will repeat after the next boot");
    }

    nvs_close(nvs);
    return value;
}

static void buffer_append(uint32_t seq, float temperature, float humidity)
{
    if (buffer_count >= CONFIG_BUFFER_MAX) {
        dropped_count++;
        return;
    }

    buffer[buffer_count].seq = seq;
    buffer[buffer_count].mono_us = esp_timer_get_time();
    buffer[buffer_count].temperature = temperature;
    buffer[buffer_count].humidity = humidity;
    buffer_count++;
}

static int build_payload(size_t count)
{
    struct timeval tv;
    gettimeofday(&tv, NULL);
    int64_t wall_now_ms = (int64_t) tv.tv_sec * 1000 + tv.tv_usec / 1000;
    int64_t mono_now_us = esp_timer_get_time();

    int written = snprintf(payload, sizeof(payload),
                           "{\"device_id\":\"%s\",\"boot_id\":%lu,\"samples\":[",
                           device_id, (unsigned long) boot_id);
    if (written < 0 || (size_t) written >= sizeof(payload)) {
        return -1;
    }
    size_t n = (size_t) written;

    for (size_t i = 0; i < count; i++) {
        int64_t device_ts = wall_now_ms - (mono_now_us - buffer[i].mono_us) / 1000;

        written = snprintf(payload + n, sizeof(payload) - n,
                           "%s{\"seq\":%lu,\"device_ts\":%lld,"
                           "\"temperature\":%.2f,\"humidity\":%.2f}",
                           i == 0 ? "" : ",",
                           (unsigned long) buffer[i].seq, device_ts,
                           buffer[i].temperature, buffer[i].humidity);
        if (written < 0 || (size_t) written >= sizeof(payload) - n) {
            return -1;
        }
        n += (size_t) written;
    }

    written = snprintf(payload + n, sizeof(payload) - n, "]}");
    if (written < 0 || (size_t) written >= sizeof(payload) - n) {
        return -1;
    }
    return (int) (n + (size_t) written);
}

static void buffer_flush(esp_mqtt_client_handle_t client, const char *topic)
{
    if (buffer_count == 0) {
        return;
    }

    size_t count = buffer_count < CONFIG_BATCH_MAX ? buffer_count : CONFIG_BATCH_MAX;

    int len = build_payload(count);
    if (len < 0) {
        ESP_LOGE(TAG, "batch of %u samples does not fit", (unsigned) count);
        return;
    }

    int msg_id = esp_mqtt_client_publish(client, topic, payload, len, 1, 0);
    if (msg_id < 0) {
        ESP_LOGW(TAG, "publish rejected: %d", msg_id);
        return;
    }

    buffer_count -= count;
    memmove(buffer, buffer + count, buffer_count * sizeof(sample_t));
}

static esp_err_t load_str(nvs_handle_t nvs, const char *key, char *out, size_t size)
{
    size_t len = size;
    esp_err_t err = nvs_get_str(nvs, key, out, &len);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "key '%s': %s", key, esp_err_to_name(err));
    }
    return err;
}

static esp_err_t load_credentials(void)
{
    nvs_handle_t nvs;
    esp_err_t err = nvs_open("device", NVS_READONLY, &nvs);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_open failed: %s", esp_err_to_name(err));
        return err;
    }

    err  = load_str(nvs, "wifi_ssid",  wifi_ssid,   sizeof(wifi_ssid));
    err |= load_str(nvs, "wifi_pass",  wifi_pass,   sizeof(wifi_pass));
    err |= load_str(nvs, "dev_id",     device_id,   sizeof(device_id));
    err |= load_str(nvs, "dev_pass",   device_pass, sizeof(device_pass));
    err |= load_str(nvs, "broker_uri", broker_uri,  sizeof(broker_uri));

    nvs_close(nvs);
    return err == ESP_OK ? ESP_OK : ESP_FAIL;
}

void app_main(void)
{
uint8_t mac[6];
uint32_t heap_size;


i2c_master_bus_config_t bus_cfg = {
    .i2c_port = -1,
    .sda_io_num = CONFIG_I2C_SDA_GPIO,
    .scl_io_num = CONFIG_I2C_SCL_GPIO,
    .clk_source = I2C_CLK_SRC_DEFAULT,
    .glitch_ignore_cnt = 7,
    .flags.enable_internal_pullup = true,
};
i2c_master_bus_handle_t bus;
ESP_ERROR_CHECK(i2c_new_master_bus(&bus_cfg, &bus));

i2c_device_config_t dev_cfg = {
    .dev_addr_length = I2C_ADDR_BIT_LEN_7,
    .device_address = AHT20_ADDR,
    .scl_speed_hz = 100000,
};
i2c_master_dev_handle_t sensor;
ESP_ERROR_CHECK(i2c_master_bus_add_device(bus, &dev_cfg, &sensor));

esp_err_t err = nvs_flash_init();
if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    err = nvs_flash_init();
}
ESP_ERROR_CHECK(err);

if (load_credentials() != ESP_OK) {
    ESP_LOGE(TAG, "no credentials in NVS, provision the device first");
    return;
}

ESP_ERROR_CHECK(esp_netif_init());
ESP_ERROR_CHECK(esp_event_loop_create_default());
esp_netif_create_default_wifi_sta();

wifi_events = xEventGroupCreate();

esp_event_handler_instance_t any_wifi;
esp_event_handler_instance_t got_ip;
ESP_ERROR_CHECK(esp_event_handler_instance_register(
    WIFI_EVENT, ESP_EVENT_ANY_ID, &on_wifi_event, NULL, &any_wifi));
ESP_ERROR_CHECK(esp_event_handler_instance_register(
    IP_EVENT, IP_EVENT_STA_GOT_IP, &on_wifi_event, NULL, &got_ip));

heap_size = esp_get_free_heap_size();
ESP_LOGI(TAG, "heap_size: %lu", heap_size);
ESP_LOGI(TAG, "free heap befour wifi: %lu", esp_get_free_heap_size());

wifi_init_config_t init_cfg = WIFI_INIT_CONFIG_DEFAULT();
ESP_ERROR_CHECK(esp_wifi_init(&init_cfg));

wifi_config_t wifi_cfg = { 0 };
strncpy((char *) wifi_cfg.sta.ssid, wifi_ssid, sizeof(wifi_cfg.sta.ssid));
strncpy((char *) wifi_cfg.sta.password, wifi_pass, sizeof(wifi_cfg.sta.password));

ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg));
ESP_ERROR_CHECK(esp_wifi_start());

EventBits_t bits = xEventGroupWaitBits(
    wifi_events, WIFI_CONNECTED_BIT | WIFI_FAILED_BIT,
    pdFALSE, pdFALSE, portMAX_DELAY);

ESP_LOGI(TAG, "free heap after wifi: %lu", esp_get_free_heap_size());

if (bits & WIFI_CONNECTED_BIT) {
    ESP_LOGI(TAG, "connected to %s", wifi_ssid);
} else {
    ESP_LOGE(TAG, "could not connect to %s", wifi_ssid);
}

esp_sntp_config_t sntp_cfg = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
ESP_ERROR_CHECK(esp_netif_sntp_init(&sntp_cfg));
esp_err_t sync = esp_netif_sntp_sync_wait(pdMS_TO_TICKS(20000));
if(sync != ESP_OK){
    ESP_LOGE(TAG, "Time synchronization error %s", esp_err_to_name(sync));
    sync = esp_netif_sntp_sync_wait(pdMS_TO_TICKS(10000));
}

esp_mqtt_client_config_t mqtt_cfg = {
    .broker.address.uri = broker_uri,
    .broker.verification.crt_bundle_attach = esp_crt_bundle_attach,
    .credentials.username = device_id,
    .credentials.client_id = device_id,
    .credentials.authentication.password = device_pass,
};

esp_mqtt_client_handle_t client = esp_mqtt_client_init(&mqtt_cfg);
ESP_ERROR_CHECK(esp_mqtt_client_register_event(client, MQTT_EVENT_ANY, &on_mqtt_event, NULL));
ESP_ERROR_CHECK(esp_mqtt_client_start(client));

EventBits_t mqtt_bits = xEventGroupWaitBits(
    wifi_events, MQTT_CONNECTED_BIT | MQTT_FAILED_BIT,
    pdFALSE, pdFALSE, pdMS_TO_TICKS(15000));

if (!(mqtt_bits & MQTT_CONNECTED_BIT)) {
    ESP_LOGE(TAG, "no connection to the broker");
    return;
}

char topic[64];
snprintf(topic, sizeof(topic), "devices/%s/telemetry", device_id);

struct timeval tv;
gettimeofday(&tv, NULL);
int64_t device_ts = (int64_t) tv.tv_sec * 1000 + tv.tv_usec / 1000;

ESP_LOGI(TAG, "device_ts: %lld", device_ts);

boot_id = next_boot_id();
ESP_LOGI(TAG, "boot_id %lu", (unsigned long) boot_id);

uint32_t seq = 0;
TickType_t last_wake = xTaskGetTickCount();

for (;;) {
    float temperature = 0.0f;
    float humidity = 0.0f;

    if (aht20_read(sensor, &temperature, &humidity) == ESP_OK) {
        buffer_append(seq, temperature, humidity);
        seq++;
    } else {
        ESP_LOGW(TAG, "sensor read failed");
    }

    if (xEventGroupGetBits(wifi_events) & MQTT_CONNECTED_BIT) {
        buffer_flush(client, topic);
    }

    if (seq % 15 == 0) {
        ESP_LOGI(TAG, "buffer %u/%d, dropped %lu, free heap %lu",
                 (unsigned) buffer_count, CONFIG_BUFFER_MAX,
                 (unsigned long) dropped_count,
                 (unsigned long) esp_get_free_heap_size());
    }

    xTaskDelayUntil(&last_wake, pdMS_TO_TICKS(CONFIG_SAMPLE_INTERVAL_MS));
}

esp_chip_info_t info;
esp_chip_info(&info);
ESP_LOGI(TAG, "cores: %d; revision: %d", info.cores, info.revision);



esp_err_t errMac = esp_read_mac(mac, ESP_MAC_WIFI_STA);
if (errMac != ESP_OK) {
    ESP_LOGE(TAG, "Something went wrong: %s", esp_err_to_name(errMac));
    return;
}
ESP_LOGI(TAG, "The address read is: %02x:%02x:%02x:%02x:%02x:%02x", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);




}