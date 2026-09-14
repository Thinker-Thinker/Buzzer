/**
 * SPE UI Buzzer - Local Proxy & WebSocket Bridge
 * Connects Public/ngrok Web Clients to the local ESP32 (192.168.4.1)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;
const ESP32_IP = process.env.ESP32_IP || '192.168.4.1';
const WEB_DIR = path.join(__dirname, 'web-app');

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Handle /reset proxy to ESP32
  if (req.url === '/reset') {
    try {
      const response = await fetch(`http://${ESP32_IP}/reset`, { signal: AbortSignal.timeout(3000) });
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    } catch (err) {
      // Return OK so client UI resets even if ESP32 is offline during dev
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK (offline)');
    }
    return;
  }

  // Static File Serving
  let filePath = path.join(WEB_DIR, req.url === '/' ? 'index.html' : req.url);
  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// WebSocket Server (Bridges browser clients <-> ESP32)
const wss = new WebSocketServer({ server, path: '/ws' });
let esp32Ws = null;
let lastKnownRanking = '{"ranking":[]}';

function connectToESP32() {
  if (esp32Ws && esp32Ws.readyState === WebSocket.OPEN) return;

  try {
    esp32Ws = new WebSocket(`ws://${ESP32_IP}/ws`);

    esp32Ws.on('open', () => {
      console.log(`[Bridge] Connected to ESP32 WebSocket at ws://${ESP32_IP}/ws`);
    });

    esp32Ws.on('message', (data) => {
      lastKnownRanking = data.toString();
      // Broadcast to all connected web clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(lastKnownRanking);
        }
      });
    });

    esp32Ws.on('close', () => {
      setTimeout(connectToESP32, 2000);
    });

    esp32Ws.on('error', () => {
      setTimeout(connectToESP32, 2000);
    });
  } catch (e) {
    setTimeout(connectToESP32, 2000);
  }
}

// Client connections from browser/ngrok
wss.on('connection', (ws) => {
  // Send current state to newly connected client
  ws.send(lastKnownRanking);

  ws.on('message', (message) => {
    // If client sends message, forward to ESP32
    if (esp32Ws && esp32Ws.readyState === WebSocket.OPEN) {
      esp32Ws.send(message);
    }
  });
});

// Start ESP32 connection loop
connectToESP32();

// Start Server
server.listen(PORT, () => {
  console.log(`[Bridge Server] Running at http://localhost:${PORT}`);
  console.log(`[Bridge Server] Proxying to ESP32 at ${ESP32_IP}`);
});
