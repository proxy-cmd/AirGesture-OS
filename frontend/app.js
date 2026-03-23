const RUPEE = "\u20B9";

const state = {
  receiverId: null,
  html5QrCode: null,
  scannerRunning: false,
};

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function getBackendUrl() {
  return normalizeUrl(localStorage.getItem("backend_url"));
}

function hasBackendUrl() {
  return Boolean(getBackendUrl());
}

function formatInr(amount) {
  return `${RUPEE}${Number(amount || 0).toLocaleString("en-IN")}`;
}

function setMessage(element, text, styleClass = "muted") {
  if (!element) {
    return;
  }

  element.textContent = text;
  element.className = `result-text ${styleClass}`;
}

async function fetchJson(path, options = {}) {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    throw new Error("Backend URL is not configured");
  }

  const response = await fetch(`${backendUrl}${path}`, options);
  const data = await response.json();

  if (!response.ok) {
    const message = data?.message || "Request failed";
    throw new Error(message);
  }

  return data;
}

async function loadBalances() {
  try {
    const accounts = await fetchJson("/accounts");

    const senderBalance = document.getElementById("senderBalance");
    const machineBalance = document.getElementById("machineBalance");

    if (senderBalance && typeof accounts.user1 === "number") {
      senderBalance.textContent = formatInr(accounts.user1);
    }

    if (machineBalance && typeof accounts.machine_001 === "number") {
      machineBalance.textContent = formatInr(accounts.machine_001);
    }
  } catch (error) {
    console.warn(error.message);
  }
}

function connectSocket() {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    const statusText = document.getElementById("statusText");
    if (statusText) {
      statusText.textContent = "Set endpoint from role select first.";
    }
    return null;
  }

  const socket = io(backendUrl, {
    transports: ["websocket", "polling"],
  });

  socket.on("payment_received", (payload) => {
    handlePaymentEvent(payload);
  });

  socket.on("connect_error", () => {
    const statusText = document.getElementById("statusText");
    if (statusText) {
      statusText.textContent = "Realtime link unavailable. Check endpoint.";
    }
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
  oscillator.frequency.value = 760;
  gain.gain.value = 0.02;

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.12);
}

function setNoteLabels(amount) {
  const values = [Math.ceil(amount / 3), Math.floor(amount / 3), amount - Math.ceil(amount / 3) - Math.floor(amount / 3)]
    .filter((x) => x > 0);

  const notes = Array.from(document.querySelectorAll("#cashStage .note"));
  notes.forEach((note, index) => {
    const fallback = values[values.length - 1] || amount;
    const value = values[index] || fallback;
    note.textContent = `${RUPEE}${value}`;
  });
}

function triggerCashAnimation(amount) {
  const stage = document.getElementById("cashStage");
  if (!stage) {
    return;
  }

  setNoteLabels(amount);

  stage.classList.remove("hidden");
  stage.classList.remove("active");

  // Force reflow so the animation can replay for every incoming payment.
  void stage.offsetWidth;

  setTimeout(() => {
    stage.classList.add("active");
  }, 180);
}

function handlePaymentEvent(payload) {
  const statusText = document.getElementById("statusText");
  const machineBalance = document.getElementById("machineBalance");
  const amount = Number(payload.amount || 0);

  if (statusText) {
    statusText.textContent = `${formatInr(amount)} received`; 
  }

  if (machineBalance && typeof payload.machine_balance === "number") {
    machineBalance.textContent = formatInr(payload.machine_balance);
  }

  triggerCashAnimation(amount);
  playSuccessBeep();
}

async function sendPayment() {
  const amountInput = document.getElementById("amountInput");
  const paymentResult = document.getElementById("paymentResult");

  if (!hasBackendUrl()) {
    setMessage(paymentResult, "Set endpoint from role select first.", "error");
    return;
  }

  if (!state.receiverId) {
    setMessage(paymentResult, "Scan QR first.", "error");
    return;
  }

  const amount = Number(amountInput.value);
  if (!amount || amount <= 0) {
    setMessage(paymentResult, "Enter a valid amount.", "error");
    return;
  }

  try {
    const data = await fetchJson("/pay", {
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

    setMessage(paymentResult, `Payment successful: ${formatInr(data.amount)}`, "success");

    const senderBalance = document.getElementById("senderBalance");
    if (senderBalance && typeof data.sender_balance === "number") {
      senderBalance.textContent = formatInr(data.sender_balance);
    }

    amountInput.value = "";
  } catch (error) {
    setMessage(paymentResult, error.message || "Payment failed", "error");
  }
}

function buildDispenseScreen() {
  const receiverPayload = { receiver: "machine_001" };
  const qrContainer = document.getElementById("qrcode");

  if (qrContainer) {
    new QRCode(qrContainer, {
      text: JSON.stringify(receiverPayload),
      width: 220,
      height: 220,
      colorDark: "#261b13",
      colorLight: "#fffdf8",
      correctLevel: QRCode.CorrectLevel.H,
    });
  }

  connectSocket();
  loadBalances();
}

function setReceiver(receiverId) {
  state.receiverId = receiverId;
  const receiverText = document.getElementById("receiverText");
  const payBtn = document.getElementById("payBtn");
  const paymentResult = document.getElementById("paymentResult");

  if (receiverText) {
    receiverText.textContent = receiverId;
  }

  if (payBtn) {
    payBtn.disabled = !hasBackendUrl();
  }

  setMessage(paymentResult, "Receiver ready. Enter amount and pay.", "muted");
}

async function onScanSuccess(decodedText) {
  try {
    const parsed = JSON.parse(decodedText);
    if (!parsed.receiver) {
      throw new Error("Invalid QR payload");
    }

    setReceiver(parsed.receiver);

    if (state.html5QrCode && state.scannerRunning) {
      await state.html5QrCode.stop();
      state.scannerRunning = false;
    }
  } catch (error) {
    const paymentResult = document.getElementById("paymentResult");
    setMessage(paymentResult, "Invalid QR data", "error");
  }
}

async function startScanner() {
  const paymentResult = document.getElementById("paymentResult");

  if (!hasBackendUrl()) {
    setMessage(paymentResult, "Set endpoint from role select first.", "error");
    return;
  }

  if (!window.isSecureContext) {
    setMessage(paymentResult, "Camera needs secure site (HTTPS).", "error");
    return;
  }

  if (!state.html5QrCode) {
    state.html5QrCode = new Html5Qrcode("reader");
  }

  if (state.scannerRunning) {
    setMessage(paymentResult, "Scanner already running.", "muted");
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
    setMessage(paymentResult, "Scanner active. Point camera at QR.", "muted");
  } catch (error) {
    setMessage(paymentResult, "Camera unavailable. Check permissions.", "error");
  }
}

function buildPayScreen() {
  const startScanBtn = document.getElementById("startScanBtn");
  const payBtn = document.getElementById("payBtn");
  const paymentResult = document.getElementById("paymentResult");

  startScanBtn.addEventListener("click", startScanner);
  payBtn.addEventListener("click", sendPayment);

  if (!hasBackendUrl()) {
    startScanBtn.disabled = true;
    payBtn.disabled = true;
    setMessage(paymentResult, "Save endpoint in Role Select to continue.", "error");
  }

  loadBalances();
}

function buildHomeScreen() {
  const backendUrlInput = document.getElementById("backendUrlInput");
  const saveBackendBtn = document.getElementById("saveBackendBtn");
  const backendSaveResult = document.getElementById("backendSaveResult");

  const current = getBackendUrl();
  backendUrlInput.value = current;
  backendSaveResult.textContent = current ? `Current endpoint: ${current}` : "No endpoint saved yet.";

  saveBackendBtn.addEventListener("click", () => {
    const value = normalizeUrl(backendUrlInput.value);

    try {
      const parsed = new URL(value);
      if (!["https:", "http:"].includes(parsed.protocol)) {
        throw new Error();
      }
    } catch {
      setMessage(backendSaveResult, "Enter a valid URL (http or https).", "error");
      return;
    }

    localStorage.setItem("backend_url", value);
    setMessage(backendSaveResult, `Endpoint saved: ${value}`, "success");
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