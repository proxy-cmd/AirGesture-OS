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
MACHINE_NAME = os.getenv("MACHINE_NAME", "chutta mate 1").strip()
USER_NAME = os.getenv("USER_NAME", "user1").strip()
ESP32_ENDPOINT = os.getenv("ESP32_ENDPOINT", "").strip()
ESP32_API_KEY = os.getenv("ESP32_API_KEY", "").strip()
ESP32_TIMEOUT_SECONDS = float(os.getenv("ESP32_TIMEOUT_SECONDS", "2.5"))

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
app.config["SECRET_KEY"] = "prototype-secret"
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

accounts = {
    USER_NAME: 100000,
    MACHINE_NAME: 0,
}
transactions = deque(maxlen=50)


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

    headers = {"Content-Type": "application/json"}
    if ESP32_API_KEY:
        headers["X-API-Key"] = ESP32_API_KEY

    req = urlrequest.Request(ESP32_ENDPOINT, data=payload, method="POST", headers=headers)

    try:
        with urlrequest.urlopen(req, timeout=ESP32_TIMEOUT_SECONDS) as response:
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
    return jsonify({"status": "ok", "machine_name": MACHINE_NAME, "esp_endpoint": ESP32_ENDPOINT or None})


@app.get("/accounts")
def get_accounts():
    return jsonify(accounts)


@app.get("/transactions")
def get_transactions():
    return jsonify(list(transactions))


@app.get("/esp-status")
def esp_status():
    if not ESP32_ENDPOINT:
        return jsonify({"enabled": False, "ok": False, "message": "ESP32_ENDPOINT not configured"}), 400

    # Replace /dispense with /health if possible.
    health_url = ESP32_ENDPOINT.rstrip("/")
    if health_url.endswith("/dispense"):
        health_url = health_url[: -len("/dispense")] + "/health"

    req = urlrequest.Request(health_url, method="GET")
    try:
        with urlrequest.urlopen(req, timeout=ESP32_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8", errors="replace")
            return jsonify(
                {
                    "enabled": True,
                    "ok": 200 <= response.status < 300,
                    "status_code": response.status,
                    "health_url": health_url,
                    "response": body,
                }
            )
    except Exception as exc:
        return jsonify({"enabled": True, "ok": False, "health_url": health_url, "message": str(exc)}), 502


@app.post("/trigger-dispense")
def trigger_dispense():
    payload = request.get_json(silent=True) or {}
    try:
        amount = int(payload.get("amount", 10))
    except (TypeError, ValueError):
        return jsonify({"status": "failed", "message": "Invalid amount"}), 400

    if amount <= 0:
        return jsonify({"status": "failed", "message": "Amount must be positive"}), 400

    fake_transaction = {
        "id": len(transactions) + 1,
        "amount": amount,
        "from": USER_NAME,
        "to": MACHINE_NAME,
        "machine_balance": accounts[MACHINE_NAME],
        "sender_balance": accounts[USER_NAME],
        "timestamp": datetime.now().isoformat(timespec="seconds"),
    }

    signal = notify_esp32(fake_transaction)
    return jsonify({"status": "success" if signal.get("ok") else "failed", "dispenser_signal": signal})


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
    print(f"[START] Machine name: {MACHINE_NAME}")
    print(f"[START] User name: {USER_NAME}")
    print(f"[START] ESP32_ENDPOINT: {ESP32_ENDPOINT or '(not set)'}")
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
