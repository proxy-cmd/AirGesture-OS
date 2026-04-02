# ChillerMate - Virtual QR Payment to Cash Dispense Prototype

A realtime prototype where one page supports the complete flow:

1. Intro step explains the 2-device demo.
2. Dispense step shows QR for `chutta mate 1`.
3. Pay step supports two modes:
   - Scan QR mode (camera permission + scanner)
   - Demo mode (no camera)
4. Payment flow is interactive: amount -> PIN (`123456`) -> success.
5. Successful payment triggers realtime dispense animation.

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Python Flask + Flask-SocketIO
- Bank Model: in-memory dictionary (no database)

## Project Structure

```text
project-root/
|- backend/
|  |- app.py
|  |- requirements.txt
|- frontend/
|  |- index.html
|  |- styles.css
|  |- app.js
|  |- assets/
|- README.md
```

## Quick Start

### 1) Start backend

```bash
cd backend
python -m pip install -r requirements.txt
python app.py
```

## ESP32 Trigger Integration

1. Flash ESP32 with sketch from `code.txt`.
2. Note ESP32 local IP from Serial Monitor (example `192.168.1.45`).
3. Start backend with ESP endpoint:

```bash
cd backend
$env:ESP32_ENDPOINT="http://192.168.1.45/dispense"
python app.py
```

After each successful `/pay`, backend sends HTTP POST to ESP32 and motor runs.

### First-Time ESP32 Setup (Windows + Arduino IDE)

1. Install Arduino IDE (2.x).
2. Open Arduino IDE -> File -> Preferences.
3. In **Additional boards manager URLs**, add:
   `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
4. Open Tools -> Board -> Boards Manager.
5. Search `esp32` and install **esp32 by Espressif Systems**.
6. Connect ESP32 with USB cable.
7. Open Tools -> Port and select your ESP32 COM port.
8. Open Tools -> Board and select your ESP32 board (for most dev boards: `ESP32 Dev Module`).
9. Copy-paste `code.txt` into Arduino IDE and click Upload.

## Single Entry Point

Open only:

- `/` (served by Flask on port 5000)

Use top step tabs:

- `1. Intro`
- `2. Dispense`
- `3. Pay`

## Demo Flow (Phone + Laptop)

1. Open same page (`index.html`) on both devices.
2. Laptop: switch to **Dispense** tab and keep QR visible.
3. Phone: switch to **Pay** tab and tap **Start Camera Scanner**.
4. Scan laptop QR (or tap **Use Demo Receiver**).
5. Enter amount and tap **Pay Now**.
6. Laptop dispense section updates in realtime and plays note animation.

## Ngrok (Recommended Demo Setup)

Run one tunnel only:

```bash
ngrok http 5000
```

Open the ngrok URL directly. No separate frontend tunnel needed.

## Auto Backend Connection

Frontend auto-tries these endpoints in order:

1. `window.__PROXY_BANK_API` (if set by developer)
2. current site origin
3. local fallback endpoints

If backend is not reachable, UI shows a clear status message.

## Dummy Accounts

From backend `app.py`:

- `user1`: 1000
- `chutta mate 1`: 0

## API

### `POST /pay`

Request:

```json
{
  "from": "user1",
  "to": "chutta mate 1",
  "amount": 20
}
```

Response:

```json
{
  "status": "success",
  "amount": 20,
  "from": "user1",
  "to": "chutta mate 1",
  "machine_balance": 20,
  "sender_balance": 980
}
```

## Notes

- No real bank, no real UPI, no external payment gateways.
- Pure prototype flow for demo use.
- Realtime socket event: `payment_received`.
