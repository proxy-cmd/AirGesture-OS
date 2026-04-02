from pathlib import Path
from datetime import datetime
from collections import deque
import json
import os
from urllib import error, request as urlrequest

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
app.config["SECRET_KEY"] = "prototype-secret"
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

accounts = {
    "user1": 100000,
    "chutta mate 1": 0,
}
transactions = deque(maxlen=50)
ESP32_ENDPOINT = os.getenv("ESP32_ENDPOINT", "").strip()


def notify_esp32(transaction: dict) -> dict:
    if not ESP32_ENDPOINT:
        return {"enabled": False, "ok": False, "message": "ESP32_ENDPOINT not configured"}

    payload = json.dumps(
        {
            "event": "dispense",
            "amount": transaction["amount"],
            "transaction_id": transaction["id"],
            "timestamp": transaction["timestamp"],
        }
    ).encode("utf-8")

    req = urlrequest.Request(
        ESP32_ENDPOINT,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    try:
        with urlrequest.urlopen(req, timeout=2.5) as response:
            return {
                "enabled": True,
                "ok": 200 <= response.status < 300,
                "status_code": response.status,
            }
    except error.HTTPError as exc:
        return {"enabled": True, "ok": False, "status_code": exc.code, "message": str(exc)}
    except Exception as exc:
        return {"enabled": True, "ok": False, "message": str(exc)}


@app.get("/health")
def health_check():
    return jsonify({"status": "ok"})


@app.get("/accounts")
def get_accounts():
    return jsonify(accounts)


@app.get("/transactions")
def get_transactions():
    return jsonify(list(transactions))


@app.post("/pay")
def pay():
    payload = request.get_json(silent=True) or {}

    sender = payload.get("from")
    receiver = payload.get("to")
    amount = payload.get("amount")

    if not isinstance(sender, str) or not isinstance(receiver, str):
        return jsonify({"status": "failed", "message": "Invalid accounts"}), 400

    if sender not in accounts or receiver not in accounts:
        return jsonify({"status": "failed", "message": "Account not found"}), 404

    try:
        amount = int(amount)
    except (TypeError, ValueError):
        return jsonify({"status": "failed", "message": "Invalid amount"}), 400

    if amount <= 0:
        return jsonify({"status": "failed", "message": "Amount must be positive"}), 400

    if accounts[sender] < amount:
        return jsonify({"status": "failed", "message": "Insufficient balance"}), 400

    accounts[sender] -= amount
    accounts[receiver] += amount

    transaction = {
        "id": len(transactions) + 1,
        "amount": amount,
        "from": sender,
        "to": receiver,
        "machine_balance": accounts[receiver],
        "sender_balance": accounts[sender],
        "timestamp": datetime.now().isoformat(timespec="seconds"),
    }
    transactions.appendleft(transaction)
    dispenser_signal = notify_esp32(transaction)

    socketio.emit(
        "payment_received",
        transaction,
    )

    return jsonify({"status": "success", **transaction, "dispenser_signal": dispenser_signal})


@app.get("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/<path:path>")
def serve_static(path: str):
    static_path = Path(app.static_folder) / path
    if static_path.exists() and static_path.is_file():
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
