const DEFAULT_BACKEND_URL = "http://localhost:5000";
const RUPEE = "\u20B9";

const state = {
  receiverId: null,
  html5QrCode: null,
  scannerRunning: false,
};

function getBackendUrl() {
  return localStorage.getItem("backend_url") || DEFAULT_BACKEND_URL;
}

function formatInr(amount) {
  return `${RUPEE}${Number(amount || 0).toLocaleString("en-IN")}`;
}

function connectSocket() {
  const socket = io(getBackendUrl());

  socket.on("connect", () => {
    console.log("Socket connected");
  });

  socket.on("payment_received", (payload) => {
    handlePaymentEvent(payload);
  });

  return socket;
}

function playSuccessBeep() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  const ctx = new AudioContextClass();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.value = 740;
  gain.gain.value = 0.02;

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.12);
}

function triggerCashAnimation() {
  const stage = document.getElementById("cashStage");
  if (!stage) {
    return;
  }

  stage.classList.remove("hidden");
  stage.classList.remove("active");

  // Force reflow so the same animation can replay for each payment.
  void stage.offsetWidth;

  stage.classList.add("active");
}

function handlePaymentEvent(payload) {
  const statusText = document.getElementById("statusText");
  const machineBalance = document.getElementById("machineBalance");

  if (statusText) {
    statusText.textContent = `${formatInr(payload.amount)} received`;
  }

  if (machineBalance) {
    machineBalance.textContent = formatInr(payload.machine_balance);
  }

  triggerCashAnimation();
  playSuccessBeep();
}

async function sendPayment() {
  const amountInput = document.getElementById("amountInput");
  const paymentResult = document.getElementById("paymentResult");
  const senderBalance = document.getElementById("senderBalance");

  if (!state.receiverId) {
    paymentResult.textContent = "Scan QR first.";
    paymentResult.className = "result-text error";
    return;
  }

  const amount = Number(amountInput.value);
  if (!amount || amount <= 0) {
    paymentResult.textContent = "Enter a valid amount.";
    paymentResult.className = "result-text error";
    return;
  }

  try {
    const response = await fetch(`${getBackendUrl()}/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "user1",
        to: state.receiverId,
        amount,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.status !== "success") {
      const msg = data.message || "Payment failed";
      paymentResult.textContent = msg;
      paymentResult.className = "result-text error";
      return;
    }

    paymentResult.textContent = `Payment successful: ${formatInr(data.amount)}`;
    paymentResult.className = "result-text success";
    senderBalance.textContent = formatInr(data.sender_balance);
    amountInput.value = "";
  } catch (error) {
    paymentResult.textContent = "Could not connect to backend.";
    paymentResult.className = "result-text error";
    console.error(error);
  }
}

function buildDispenseScreen() {
  const receiverPayload = { receiver: "machine_001" };
  const qrContainer = document.getElementById("qrcode");

  new QRCode(qrContainer, {
    text: JSON.stringify(receiverPayload),
    width: 220,
    height: 220,
    colorDark: "#101010",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H,
  });

  connectSocket();
}

function setReceiver(receiverId) {
  state.receiverId = receiverId;
  const receiverText = document.getElementById("receiverText");
  const payBtn = document.getElementById("payBtn");
  const paymentResult = document.getElementById("paymentResult");

  receiverText.textContent = receiverId;
  payBtn.disabled = false;
  paymentResult.textContent = "Receiver ready. Enter amount and pay.";
  paymentResult.className = "result-text muted";
}

async function onScanSuccess(decodedText) {
  try {
    const parsed = JSON.parse(decodedText);
    if (!parsed.receiver) {
      throw new Error("receiver missing");
    }

    setReceiver(parsed.receiver);

    if (state.html5QrCode && state.scannerRunning) {
      await state.html5QrCode.stop();
      state.scannerRunning = false;
    }
  } catch (error) {
    const paymentResult = document.getElementById("paymentResult");
    paymentResult.textContent = "Invalid QR data";
    paymentResult.className = "result-text error";
    console.error(error);
  }
}

async function startScanner() {
  const paymentResult = document.getElementById("paymentResult");

  if (!state.html5QrCode) {
    state.html5QrCode = new Html5Qrcode("reader");
  }

  if (state.scannerRunning) {
    paymentResult.textContent = "Scanner already running.";
    paymentResult.className = "result-text muted";
    return;
  }

  try {
    await state.html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 220 },
      onScanSuccess,
      () => {}
    );
    state.scannerRunning = true;
    paymentResult.textContent = "Scanner active. Point camera at QR.";
    paymentResult.className = "result-text muted";
  } catch (error) {
    paymentResult.textContent = "Camera not available. Try browser permissions.";
    paymentResult.className = "result-text error";
    console.error(error);
  }
}

function buildPayScreen() {
  const startScanBtn = document.getElementById("startScanBtn");
  const payBtn = document.getElementById("payBtn");

  startScanBtn.addEventListener("click", startScanner);
  payBtn.addEventListener("click", sendPayment);
}

function buildHomeScreen() {
  const backendUrlInput = document.getElementById("backendUrlInput");
  const saveBackendBtn = document.getElementById("saveBackendBtn");
  const backendSaveResult = document.getElementById("backendSaveResult");

  backendUrlInput.value = getBackendUrl();

  saveBackendBtn.addEventListener("click", () => {
    const value = backendUrlInput.value.trim();
    if (!value) {
      backendSaveResult.textContent = "Enter a valid backend URL.";
      backendSaveResult.className = "result-text error";
      return;
    }

    localStorage.setItem("backend_url", value.replace(/\/$/, ""));
    backendSaveResult.textContent = `Saved: ${localStorage.getItem("backend_url")}`;
    backendSaveResult.className = "result-text success";
  });
}

(function init() {
  const screen = document.body.dataset.screen;

  if (screen === "dispense") {
    buildDispenseScreen();
    return;
  }

  if (screen === "pay") {
    buildPayScreen();
    return;
  }

  if (screen === "home") {
    buildHomeScreen();
  }
})();