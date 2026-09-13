/*
  Buzzer System - Central Unit (ESP32)
  =====================================
  What this does:
    - Hosts its own WiFi network (SoftAP) that the 4 buzzer nodes AND the
      spectator/host's phone or laptop connect to.
    - Listens for UDP "buzz" packets from nodes and ranks them by the order
      they arrive.
    - Serves a live-updating web page (pushed over WebSocket) showing the
      ranking.
    - Has a "New Round" button on the web page that resets the ranking and
      tells all 4 nodes to unlock their buttons again.

  Libraries needed (Arduino IDE > Tools > Manage Libraries, search by name):
    - "ESPAsyncWebServer" (by lacamera / mathieucarbou)
    - "AsyncTCP"          (by dvarrel / mathieucarbou) - ESP32 only

  Board: "ESP32 Dev Module" (install the "esp32" boards package by
  Espressif Systems via Boards Manager if you haven't already).

  After uploading, open the Serial Monitor at 115200 baud to see the
  AP's IP address (normally 192.168.4.1) and a log line every time a
  node buzzes in.
*/

#include <WiFi.h>
#include <WiFiUdp.h>
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>

// ---------- Configuration ----------
const char* AP_SSID     = "BuzzerSystem";
const char* AP_PASSWORD = "buzzer123";   // 8+ chars required, or "" for an open network

const int UDP_LISTEN_PORT = 4210;   // nodes send buzz packets here
const int UDP_NODE_PORT   = 4211;   // nodes listen for the RESET broadcast here

const int MAX_NODES = 4;
const char* NODE_NAMES[MAX_NODES] = {"Player 1", "Player 2", "Player 3", "Player 4"};

// ---------- Speaker + hardware reset button ----------
// Speaker: GPIO25 -> (small NPN transistor, e.g. 2N2222, base via ~1k resistor)
//          -> speaker -> GND, with speaker's other lead to 3.3V. A GPIO can't
//          source enough current to drive a speaker directly - use a piezo
//          buzzer element instead if you want to skip the transistor.
// Reset button: GPIO27 -> other leg to GND (uses internal pull-up).
const int SPEAKER_PIN       = 25;
const int RESET_BUTTON_PIN  = 27;
const int BUZZ_TONE_FREQ_HZ = 1000;
const int BUZZ_TONE_MS      = 400;

bool lastResetButtonState = HIGH;
bool resetButtonPressedLast = false;
unsigned long lastResetDebounceMs = 0;
const unsigned long BUTTON_DEBOUNCE_MS = 30;

// ---------- Web page (served from flash, not SPIFFS, so no filesystem setup needed) ----------
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Buzzer Ranking</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; background:#111; color:#eee; text-align:center; margin:0; padding:20px; }
  h1 { font-size: 1.6em; margin-bottom: 0.2em; }
  #status { color:#888; font-size:0.9em; margin-bottom:20px; }
  ol { list-style:none; padding:0; max-width:400px; margin:0 auto; }
  li { background:#222; margin:8px 0; padding:14px; border-radius:10px; font-size:1.3em;
       display:flex; justify-content:space-between; }
  li:nth-child(1) { background:#7a5c00; font-weight:bold; font-size:1.6em; }
  li:nth-child(2) { background:#444; }
  li:nth-child(3) { background:#3a2a1a; }
  .rank { opacity:0.6; margin-right:10px; }
  button { margin-top:30px; padding:16px 32px; font-size:1.2em; border:none; border-radius:10px;
           background:#c0392b; color:white; }
  button:active { background:#922b21; }
</style>
</head>
<body>
<h1>Buzzer Ranking</h1>
<div id="status">connecting...</div>
<ol id="ranking"></ol>
<button onclick="fetch('/reset')">New Round</button>
<script>
  let ws;
  function connect() {
    ws = new WebSocket('ws://' + location.host + '/ws');
    ws.onopen = () => document.getElementById('status').textContent = 'connected';
    ws.onclose = () => { document.getElementById('status').textContent = 'reconnecting...'; setTimeout(connect, 1000); };
    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);
      const list = document.getElementById('ranking');
      list.innerHTML = '';
      data.ranking.forEach((p, i) => {
        const li = document.createElement('li');
        li.innerHTML = '<span><span class="rank">#' + (i + 1) + '</span>' + p.name + '</span>';
        list.appendChild(li);
      });
    };
  }
  connect();
</script>
</body>
</html>
)rawliteral";

// ---------- State ----------
WiFiUDP udp;
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

bool roundActive = true;
bool hasBuzzed[MAX_NODES] = {false, false, false, false};
int  rankingOrder[MAX_NODES];   // node IDs (0-3) in the order they buzzed
int  rankCount = 0;

// ---------- Forward declarations ----------
void broadcastRanking();
void handleBuzzPacket();
void sendReset();
void resetRound();
void playBuzzSound();
void checkResetButton();

void setup() {
  Serial.begin(115200);
  delay(200);

  WiFi.mode(WIFI_AP);
  // Last argument raises the max simultaneous connections above the
  // default of 4, so the 4 nodes plus at least one viewing device (phone
  // or laptop) can all be connected at once. ESP32 hardware tops out
  // around 10 total.
  WiFi.softAP(AP_SSID, AP_PASSWORD, 1, 0, 8);
  IPAddress ip = WiFi.softAPIP();
  Serial.print("Central AP started. Connect devices to \"");
  Serial.print(AP_SSID);
  Serial.print("\" and open http://");
  Serial.println(ip);

  udp.begin(UDP_LISTEN_PORT);

  pinMode(SPEAKER_PIN, OUTPUT);
  digitalWrite(SPEAKER_PIN, LOW);
  pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);

  ws.onEvent([](AsyncWebSocket *server, AsyncWebSocketClient *client,
                AwsEventType type, void *arg, uint8_t *data, size_t len) {
    if (type == WS_EVT_CONNECT) {
      broadcastRanking(); // sync a newly connected browser with current state
    }
  });
  server.addHandler(&ws);

  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send_P(200, "text/html", INDEX_HTML);
  });

  server.on("/reset", HTTP_GET, [](AsyncWebServerRequest *request) {
    resetRound();
    request->send(200, "text/plain", "OK");
  });

  server.begin();
}

void loop() {
  handleBuzzPacket();
  checkResetButton();
  ws.cleanupClients();
  
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck > 3000) {
    lastCheck = millis();
    Serial.printf("Connected stations: %d\n", WiFi.softAPgetStationNum());
  }
}

void handleBuzzPacket() {
  int packetSize = udp.parsePacket();
  if (packetSize <= 0) return;

  uint8_t buf[8];
  int len = udp.read(buf, sizeof(buf));
  if (len < 1) return;

  uint8_t nodeId = buf[0]; // 0..3
  if (nodeId >= MAX_NODES) return;
  if (!roundActive) return;
  if (hasBuzzed[nodeId]) return; // already registered this round, ignore repeats

  hasBuzzed[nodeId] = true;
  rankingOrder[rankCount] = nodeId;
  rankCount++;

  Serial.printf("Buzz from node %d (%s) - rank #%d\n", nodeId, NODE_NAMES[nodeId], rankCount);

  if (rankCount == 1) {
    playBuzzSound(); // only the first buzz of the round gets the tone
  }

  broadcastRanking();
}

void playBuzzSound() {
  unsigned long periodUs = 1000000UL / BUZZ_TONE_FREQ_HZ;
  unsigned long cycles = (unsigned long)BUZZ_TONE_MS * 1000UL / periodUs;
  for (unsigned long i = 0; i < cycles; i++) {
    digitalWrite(SPEAKER_PIN, HIGH);
    delayMicroseconds(periodUs / 2);
    digitalWrite(SPEAKER_PIN, LOW);
    delayMicroseconds(periodUs / 2);
  }
}

void resetRound() {
  roundActive = true;
  rankCount = 0;
  for (int i = 0; i < MAX_NODES; i++) hasBuzzed[i] = false;
  sendReset();
  broadcastRanking();
  Serial.println("Round reset - listening for buzzes again.");
}

void checkResetButton() {
  bool reading = digitalRead(RESET_BUTTON_PIN); // LOW = pressed

  if (reading != lastResetButtonState) {
    lastResetDebounceMs = millis();
  }

  if ((millis() - lastResetDebounceMs) > BUTTON_DEBOUNCE_MS) {
    bool pressed = (reading == LOW);
    if (pressed && !resetButtonPressedLast) {
      resetRound();
    }
    resetButtonPressedLast = pressed;
  }
  lastResetButtonState = reading;
}

void sendReset() {
  uint8_t msg[1] = {0xFF}; // 0xFF = reset command
  IPAddress broadcastIp(192, 168, 4, 255); // broadcast address for the 192.168.4.x AP subnet
  udp.beginPacket(broadcastIp, UDP_NODE_PORT);
  udp.write(msg, 1);
  udp.endPacket();
}

void broadcastRanking() {
  String json = "{\"ranking\":[";
  for (int i = 0; i < rankCount; i++) {
    if (i > 0) json += ",";
    json += "{\"id\":" + String(rankingOrder[i]) + ",\"name\":\"" + String(NODE_NAMES[rankingOrder[i]]) + "\"}";
  }
  json += "]}";
  ws.textAll(json);
}
