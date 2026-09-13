/*
  Buzzer System - Node (ESP8266)
  ================================
  Flash this SAME sketch onto each of the 4 ESP8266 minis. The only thing
  you change between boards is NODE_ID below (0, 1, 2, or 3 - each board
  needs a different, unique value).

  Wiring (ESP-01 module - only GPIO0 and GPIO2 are available for this):
    Button: one leg to GPIO2, other leg to GND.
            Uses the chip's internal pull-up resistor, so no external
            resistor is needed for the button itself.
            IMPORTANT: don't hold the button down while powering on the
            board - GPIO2 is a boot-mode pin and must be high at power-up
            or the module won't boot normally.
    No LED on this build: the ESP-01 only exposes GPIO0 and GPIO2, and
    GPIO0 is too boot-sensitive to safely share with an LED. TX/RX are
    needed for uploading and serial debug. If you want buzz feedback,
    have the CENTRAL ESP32 show it on the web page instead (it already
    does, via the ranking list).

  Board: Tools > Board > "Generic ESP8266 Module", Flash Size 1M.
*/

#include <ESP8266WiFi.h>
#include <WiFiUdp.h>

// ---------- CHANGE THIS PER NODE ----------
const uint8_t NODE_ID = 1;   // 0, 1, 2, or 3 - must be unique on each board

// ---------- Network config (must match the central ESP32 sketch) ----------
const char* AP_SSID     = "BuzzerSystem";
const char* AP_PASSWORD = "buzzer123";
IPAddress centralIP(192, 168, 4, 1);   // ESP32 SoftAP's default IP
const int UDP_SEND_PORT   = 4210;
const int UDP_LISTEN_PORT = 4211;

// ---------- Pins ----------
const int BUTTON_PIN = 2; // GPIO2 - the only safely usable GPIO on an ESP-01 for this

WiFiUDP udp;
bool locked = false;
bool lastButtonState = HIGH;
unsigned long lastDebounceMs = 0;
const unsigned long DEBOUNCE_MS = 30;

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  WiFi.mode(WIFI_STA);
  WiFi.begin(AP_SSID, AP_PASSWORD);
  Serial.print("Connecting to central");
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print(".");
  }
  Serial.println(" connected!");
  Serial.print("My IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("Node ID: ");
  Serial.println(NODE_ID);

  udp.begin(UDP_LISTEN_PORT);
}

void loop() {
  checkResetMessage();
  checkButton();
}

void checkButton() {
  bool reading = digitalRead(BUTTON_PIN); // LOW = pressed (internal pull-up)

  if (reading != lastButtonState) {
    lastDebounceMs = millis();
  }

  if ((millis() - lastDebounceMs) > DEBOUNCE_MS) {
    if (reading == LOW && !locked) {
      locked = true;
      sendBuzz();
    }
  }
  lastButtonState = reading;
}

void sendBuzz() {
  uint8_t msg[1] = {NODE_ID};
  udp.beginPacket(centralIP, UDP_SEND_PORT);
  udp.write(msg, 1);
  udp.endPacket();
  Serial.println("Buzz sent!");
}

void checkResetMessage() {
  int packetSize = udp.parsePacket();
  if (packetSize <= 0) return;

  uint8_t buf[8];
  int len = udp.read(buf, sizeof(buf));
  if (len >= 1 && buf[0] == 0xFF) {
    locked = false;
    Serial.println("Round reset.");
  }
}
