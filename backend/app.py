from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
app.config["SECRET_KEY"] = "prototype-secret"
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

accounts = {
    "user1": 1000,
    "machine_001": 0,
}


@app.get("/health")
def health_check():
    return jsonify({"status": "ok"})


@app.get("/accounts")
def get_accounts():
    return jsonify(accounts)


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

    socketio.emit(
        "payment_received",
        {
            "amount": amount,
            "from": sender,
            "to": receiver,
            "machine_balance": accounts[receiver],
            "sender_balance": accounts[sender],
        },
    )

    return jsonify(
        {
            "status": "success",
            "amount": amount,
            "from": sender,
            "to": receiver,
            "machine_balance": accounts[receiver],
            "sender_balance": accounts[sender],
        }
    )


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
