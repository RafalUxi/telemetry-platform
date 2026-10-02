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


void app_main(void)
{
uint8_t mac[6];
uint32_t heap_size;


esp_err_t err = nvs_flash_init();
if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    err = nvs_flash_init();
}
ESP_ERROR_CHECK(err);

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

wifi_config_t wifi_cfg = {
    .sta = {
        .ssid = CONFIG_WIFI_SSID,
        .password = CONFIG_WIFI_PASSWORD,
    },
};

ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg));
ESP_ERROR_CHECK(esp_wifi_start());

EventBits_t bits = xEventGroupWaitBits(
    wifi_events, WIFI_CONNECTED_BIT | WIFI_FAILED_BIT,
    pdFALSE, pdFALSE, portMAX_DELAY);

ESP_LOGI(TAG, "free heap after wifi: %lu", esp_get_free_heap_size());

if (bits & WIFI_CONNECTED_BIT) {
    ESP_LOGI(TAG, "connected to %s", CONFIG_WIFI_SSID);
} else {
    ESP_LOGE(TAG, "could not connect to %s", CONFIG_WIFI_SSID);
}

esp_sntp_config_t sntp_cfg = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
ESP_ERROR_CHECK(esp_netif_sntp_init(&sntp_cfg));
esp_err_t sync = esp_netif_sntp_sync_wait(pdMS_TO_TICKS(20000));
if(sync != ESP_OK){
    ESP_LOGE(TAG, "Time synchronization error %s", esp_err_to_name(sync));
    sync = esp_netif_sntp_sync_wait(pdMS_TO_TICKS(10000));
}

esp_mqtt_client_config_t mqtt_cfg = {
    .broker.address.uri = CONFIG_MQTT_BROKER_URI,
    .credentials.username = CONFIG_DEVICE_ID,
    .credentials.client_id = CONFIG_DEVICE_ID,
    .credentials.authentication.password = CONFIG_DEVICE_PASSWORD,
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
snprintf(topic, sizeof(topic), "devices/%s/telemetry", CONFIG_DEVICE_ID);

struct timeval tv;
gettimeofday(&tv, NULL);
int64_t device_ts = (int64_t) tv.tv_sec * 1000 + tv.tv_usec / 1000;

ESP_LOGI(TAG, "device_ts: %lld", device_ts);

char payload[256];
int n = snprintf(payload, sizeof(payload),
    "{\"device_id\":\"%s\",\"boot_id\":0,"
    "\"samples\":[{\"seq\":0,\"device_ts\":%lld,\"temperature\":%.2f,\"humidity\":%.2f}]}",
    CONFIG_DEVICE_ID, device_ts, 21.5, 48.0);

if (n < 0 || n >= (int) sizeof(payload)) {
    ESP_LOGE(TAG, "payload does not fit, needed %d bytes", n);
    return;
}

int msg_id = esp_mqtt_client_publish(client, topic, payload, n, 1, 0);
ESP_LOGI(TAG, "published msg_id %d, %d bytes", msg_id, n);



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