# ChillerMate - Virtual QR Payment to Cash Dispense Prototype

A realtime prototype where one page supports the complete flow:

1. Intro step explains the 2-device demo.
2. Dispense step shows QR for `machine_001`.
3. Pay step scans that QR (or uses demo receiver), sends payment, and triggers realtime dispense animation.

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

### 2) Serve frontend

```bash
cd frontend
python -m http.server 5500
```

## Single Entry Point

Open only:

- `/index.html`

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

## Auto Backend Connection

Frontend auto-tries these endpoints in order:

1. `window.__PROXY_BANK_API` (if set by developer)
2. current site origin
3. local fallback endpoints

If backend is not reachable, UI shows a clear status message.

## Dummy Accounts

From backend `app.py`:

- `user1`: 1000
- `machine_001`: 0

## API

### `POST /pay`

Request:

```json
{
  "from": "user1",
  "to": "machine_001",
  "amount": 20
}
```

Response:

```json
{
  "status": "success",
  "amount": 20,
  "from": "user1",
  "to": "machine_001",
  "machine_balance": 20,
  "sender_balance": 980
}
```

## Notes

- No real bank, no real UPI, no external payment gateways.
- Pure prototype flow for demo use.
- Realtime socket event: `payment_received`.