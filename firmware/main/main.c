// Telemetry device firmware.
//
// One physical device speaking the same wire contract as the simulator:
// a batch of samples published to devices/<device_id>/telemetry, with
// millisecond timestamps taken from the device clock.
//
// Stage 1a: prove the toolchain. No networking, no sensor.

#include <stdio.h>
#include "esp_chip_info.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_system.h"

static const char *TAG = "device";

void app_main(void)
{
uint8_t mac[6];
uint32_t heap_size;

esp_chip_info_t info;
esp_chip_info(&info);
ESP_LOGI(TAG, "cores: %d; revision: %d", info.cores, info.revision);

esp_err_t err = esp_read_mac(mac, ESP_MAC_WIFI_STA);
if (err != ESP_OK) {
    ESP_LOGE(TAG, "nie wyszlo: %s", esp_err_to_name(err));
    return;
}
ESP_LOGI(TAG, "The address read is: %02x:%02x:%02x:%02x:%02x:%02x", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

heap_size = esp_get_free_heap_size();
ESP_LOGI(TAG, "heap_size: %lu", heap_size);
}