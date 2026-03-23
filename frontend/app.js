const RUPEE = "\u20B9";
const RECEIVER_ID = "machine_001";
const BACKEND_CANDIDATES = [
  window.__PROXY_BANK_API,
  `${window.location.origin}`,
  "http://127.0.0.1:5000",
].filter(Boolean);

const state = {
  backendUrl: "",
  receiverId: null,
  html5QrCode: null,
  scannerRunning: false,
  socket: null,
  qrBuilt: false,
};

function formatInr(amount) {
  return `${RUPEE}${Number(amount || 0).toLocaleString("en-IN")}`;
}

function setResult(el, msg, cls = "muted") {
  if (!el) return;
  el.textContent = msg;
  el.className = `result-text ${cls}`;
}

function setSection(targetId) {
  if (targetId !== "paySection" && state.html5QrCode && state.scannerRunning) {
    state.html5QrCode.stop().catch(() => {});
    state.scannerRunning = false;
  }

  document.querySelectorAll(".section").forEach((section) => {
    section.classList.toggle("active", section.id === targetId);
  });

  document.querySelectorAll(".step-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.target === targetId);
  });

  if (targetId === "dispenseSection") {
    buildDispense();
  }
  if (targetId === "paySection") {
    initPayControls();
  }
}

async function tryHealth(baseUrl) {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

async function autoConnectBackend() {
  const status = document.getElementById("autoConnectStatus");

  for (const raw of BACKEND_CANDIDATES) {
    const url = String(raw).replace(/\/$/, "");
    const ok = await tryHealth(url);
    if (ok) {
      state.backendUrl = url;
      if (status) {
        status.textContent = "Backend connected automatically";
        status.classList.add("success");
      }
      return;
    }
  }

  if (status) {
    status.textContent = "Backend not reachable. Start server and refresh.";
    status.classList.add("error");
  }
}

async function fetchJson(path, options = {}) {
  if (!state.backendUrl) {
    throw new Error("Backend unavailable");
  }

  const res = await fetch(`${state.backendUrl}${path}`, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || "Request failed");
  }
  return data;
}

async function loadBalances() {
  try {
    const data = await fetchJson("/accounts");
    const sender = document.getElementById("senderBalance");
    const machine = document.getElementById("machineBalance");
    if (sender) sender.textContent = formatInr(data.user1);
    if (machine) machine.textContent = formatInr(data.machine_001);
  } catch {}
}

function playSuccessBeep() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

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
  notes.forEach((note, i) => {
    const fallback = values[values.length - 1] || amount;
    note.textContent = `${RUPEE}${values[i] || fallback}`;
  });
}

function triggerCashAnimation(amount) {
  const stage = document.getElementById("cashStage");
  if (!stage) return;

  setNoteLabels(amount);
  stage.classList.remove("hidden", "active");
  void stage.offsetWidth;
  setTimeout(() => stage.classList.add("active"), 180);
}

function onPaymentReceived(payload) {
  const amount = Number(payload.amount || 0);
  const status = document.getElementById("statusText");
  const machine = document.getElementById("machineBalance");

  if (status) status.textContent = `${formatInr(amount)} received`;
  if (machine && typeof payload.machine_balance === "number") {
    machine.textContent = formatInr(payload.machine_balance);
  }

  triggerCashAnimation(amount);
  playSuccessBeep();
}

function connectSocket() {
  if (state.socket || !state.backendUrl) return;

  state.socket = io(state.backendUrl, { transports: ["websocket", "polling"] });
  state.socket.on("payment_received", onPaymentReceived);
  state.socket.on("connect_error", () => {
    const status = document.getElementById("statusText");
    if (status) status.textContent = "Realtime link unavailable.";
  });
}

function buildDispense() {
  if (!state.qrBuilt) {
    const qr = document.getElementById("qrcode");
    if (qr) {
      new QRCode(qr, {
        text: JSON.stringify({ receiver: RECEIVER_ID }),
        width: 220,
        height: 220,
        colorDark: "#261b13",
        colorLight: "#fffdf8",
        correctLevel: QRCode.CorrectLevel.H,
      });
      state.qrBuilt = true;
    }
  }

  connectSocket();
  loadBalances();
}

function setReceiver(receiverId) {
  state.receiverId = receiverId;
  const receiverText = document.getElementById("receiverText");
  const payBtn = document.getElementById("payBtn");
  const result = document.getElementById("paymentResult");

  if (receiverText) receiverText.textContent = receiverId;
  if (payBtn) payBtn.disabled = !state.backendUrl;
  setResult(result, "Receiver ready. Enter amount and pay.", "muted");
}

async function onScanSuccess(decodedText) {
  try {
    const parsed = JSON.parse(decodedText);
    if (!parsed.receiver) throw new Error("Invalid qr");
    setReceiver(parsed.receiver);

    if (state.html5QrCode && state.scannerRunning) {
      await state.html5QrCode.stop();
      state.scannerRunning = false;
    }
  } catch {
    const result = document.getElementById("paymentResult");
    setResult(result, "Invalid QR data", "error");
  }
}

async function startScanner() {
  const result = document.getElementById("paymentResult");

  if (!state.backendUrl) {
    setResult(result, "Backend unavailable. Refresh after server starts.", "error");
    return;
  }

  if (!window.isSecureContext) {
    setResult(result, "Camera needs secure context (HTTPS).", "error");
    return;
  }

  if (!state.html5QrCode) {
    state.html5QrCode = new Html5Qrcode("reader");
  }

  if (state.scannerRunning) {
    setResult(result, "Scanner already running.", "muted");
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
    setResult(result, "Scanner active. Point camera at QR.", "muted");
  } catch {
    setResult(result, "Camera unavailable. Use Demo Receiver button.", "error");
  }
}

async function sendPayment() {
  const amountInput = document.getElementById("amountInput");
  const result = document.getElementById("paymentResult");

  if (!state.backendUrl) {
    setResult(result, "Backend unavailable.", "error");
    return;
  }

  if (!state.receiverId) {
    setResult(result, "Scan QR or choose demo receiver first.", "error");
    return;
  }

  const amount = Number(amountInput.value);
  if (!amount || amount <= 0) {
    setResult(result, "Enter a valid amount.", "error");
    return;
  }

  try {
    const data = await fetchJson("/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "user1", to: state.receiverId, amount }),
    });

    setResult(result, `Payment successful: ${formatInr(data.amount)}`, "success");
    const sender = document.getElementById("senderBalance");
    if (sender) sender.textContent = formatInr(data.sender_balance);
    amountInput.value = "";
  } catch (error) {
    setResult(result, error.message || "Payment failed", "error");
  }
}

let payInitialized = false;
function initPayControls() {
  if (payInitialized) {
    loadBalances();
    return;
  }

  const startScanBtn = document.getElementById("startScanBtn");
  const useDemoReceiverBtn = document.getElementById("useDemoReceiverBtn");
  const payBtn = document.getElementById("payBtn");

  startScanBtn.addEventListener("click", startScanner);
  useDemoReceiverBtn.addEventListener("click", () => setReceiver(RECEIVER_ID));
  payBtn.addEventListener("click", sendPayment);

  payInitialized = true;
  loadBalances();
}

function wireNavigation() {
  document.querySelectorAll(".step-tab").forEach((tab) => {
    tab.addEventListener("click", () => setSection(tab.dataset.target));
  });

  document.getElementById("goDispenseBtn").addEventListener("click", () => setSection("dispenseSection"));
  document.getElementById("goPayBtn").addEventListener("click", () => setSection("paySection"));
}

(async function init() {
  wireNavigation();
  await autoConnectBackend();
  buildDispense();
  initPayControls();
})();
