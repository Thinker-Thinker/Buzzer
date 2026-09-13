# SPE UI Buzzer Web Application

A minimalist, standalone web app for the wireless game buzzer system built in the `spe-ui` design language.

## Design Highlights
- **Typography**: Google Font **Host Grotesk** across all elements.
- **Minimalist Aesthetic**: Pure light mode, zero drop shadows (`box-shadow: none !important`), faint borders (`1px solid rgba(0, 0, 0, 0.08)`), solid flat colors, zero emojis, zero gradients.
- **Animations**: Powered by **GSAP** for micro-interactions on rankings, round resets, and waiting states.
- **Zero Firmware Flashing**: Connects directly to the ESP32 via WebSockets (`ws://192.168.4.1/ws`) and HTTP (`http://192.168.4.1/reset`).

---

## How to Run

### Option 1: Direct Local File (Easiest)
Simply open [`index.html`](file:///Users/user/Buzzer/web-app/index.html) directly in any modern web browser while connected to the `BuzzerSystem` Wi-Fi.

### Option 2: Local HTTP Server
Run a lightweight local server:
```bash
cd /Users/user/Buzzer/web-app
npx serve .
# or python3 -m http.server 3000
```

---

## Features & Shortcuts

- **Spacebar**: Trigger a New Round (resets hardware and UI).
- **Custom Modal Popup**: Clean notifications and lockout dialogs replacing native browser alerts.
- **Auto-reconnection**: Automatically connects to the ESP32 WebSocket on `192.168.4.1`.
