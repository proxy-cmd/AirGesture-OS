# ChillerMate - Virtual QR Payment to Cash Dispense Prototype

A realtime prototype that simulates this flow:

1. Dispense mode shows a QR with receiver `machine_001`.
2. Pay mode scans that QR and sends a dummy transfer from `user1`.
3. Backend validates balance and emits a realtime socket event.
4. Dispense mode instantly shows `\u20B9XX received` and plays cash-note animation.

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
|  |- index.html      (role select)
|  |- pay.html        (pay mode)
|  |- dispense.html   (dispense mode)
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

Backend runs on: `http://localhost:5000`

### 2) Start frontend (important for camera access)

Open a new terminal:

```bash
cd frontend
python -m http.server 5500
```

Frontend pages:

- Role select: `http://localhost:5500/index.html`
- Dispense mode: `http://localhost:5500/dispense.html`
- Pay mode: `http://localhost:5500/pay.html`

## Best Demo Setup (Phone + Laptop)

1. Open `index.html` on both devices.
2. On laptop, choose **Dispense Mode**.
3. On phone, choose **Pay Mode**.
4. On phone, tap **Start Scanner** and scan laptop QR.
5. Enter amount and tap **Pay Now**.
6. Laptop dispense screen updates in realtime and plays note animation.

## Backend URL Setting

On the role select page, set `Socket/API URL` once. It is stored in browser local storage and reused on pay + dispense screens.

Example:

- Local: `http://localhost:5000`
- Hosted backend: `https://your-backend-host.example`

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