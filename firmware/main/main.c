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