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

### 2) Serve frontend

```bash
cd frontend
python -m http.server 5500
```

## Demo Routes

- Role select: `/index.html`
- Dispense mode: `/dispense.html`
- Pay mode: `/pay.html`

## Best Demo Setup (Phone + Laptop)

1. Open role select on both devices.
2. Save your deployed backend URL in **Connect Backend**.
3. On laptop, open **Dispense Mode**.
4. On phone, open **Pay Mode**.
5. On phone, tap **Start Scanner** and scan laptop QR.
6. Enter amount and tap **Pay Now**.
7. Laptop updates in realtime with note animation.

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