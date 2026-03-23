# ChillerMate - Virtual QR Payment to Cash Dispense Prototype

A realtime prototype that simulates this flow:

1. Dispense screen shows a QR with receiver `machine_001`.
2. Pay screen scans that QR and sends a dummy transfer from `user1`.
3. Backend validates balance and emits a realtime socket event.
4. Dispense screen instantly shows `?XX received` and plays cash-note animation.

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Python Flask + Flask-SocketIO
- Bank Model: in-memory dictionary (no database)

## Project Structure

```text
project-root/
+-- backend/
¦   +-- app.py
¦   +-- requirements.txt
+-- frontend/
¦   +-- index.html
¦   +-- pay.html
¦   +-- styles.css
¦   +-- app.js
¦   +-- assets/
+-- README.md
```

## Quick Start

### 1) Start backend

```bash
cd backend
python -m pip install -r requirements.txt
python app.py
```

Backend runs on: `http://localhost:5000`

### 2) Start frontend (important for camera access)

Open a new terminal:

```bash
cd frontend
python -m http.server 5500
```

Frontend pages:

- Dispense: `http://localhost:5500/index.html`
- Pay: `http://localhost:5500/pay.html`

## Demo Flow

1. Open `index.html` in one tab.
2. Open `pay.html` in another tab/device.
3. Click **Start Scanner** on pay screen and scan dispense QR.
4. Enter amount and click **Pay Now**.
5. Dispense screen updates instantly with amount + animation.

## Dummy Accounts

From backend `app.py`:

- `user1`: 1000
- `machine_001`: 0

You can edit these balances directly in code.

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
- Pure prototype flow for demo purposes.
- Socket event used: `payment_received`.