const RUPEE = "\u20B9";
const RECEIVER_ID = "machine_001";
const DEMO_PIN = "123456";
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
  cameraGranted: false,
  payMode: "scan",
  pendingAmount: 0,
  socket: null,
  qrBuilt: false,
  recentPayments: [],
};

function formatInr(amount) {
  return `${RUPEE}${Number(amount || 0).toLocaleString("en-IN")}`;
}

function setResult(el, msg, cls = "muted") {
  if (!el) return;
  el.textContent = msg;
  el.className = `result-text ${cls}`;
}

function getById(id) {
  return document.getElementById(id);
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

function setActivePayStep(step) {
  getById("amountStep")?.classList.toggle("active", step === "amount");
  getById("pinStep")?.classList.toggle("active", step === "pin");
  updateProgress(step);
}

function updateProgress(step = "receiver") {
  const order = ["receiver", "amount", "pin", "done"];
  const targetIdx = order.indexOf(step);
  const dots = {
    receiver: getById("dotReceiver"),
    amount: getById("dotAmount"),
    pin: getById("dotPin"),
    done: getById("dotDone"),
  };

  order.forEach((key, idx) => {
    dots[key]?.classList.toggle("active", idx <= targetIdx && targetIdx >= 0);
  });
}

function togglePayMode(mode) {
  state.payMode = mode;

  getById("modeScanBtn")?.classList.toggle("active", mode === "scan");
  getById("modeDemoBtn")?.classList.toggle("active", mode === "demo");

  getById("scanModeWrap")?.classList.toggle("hidden", mode !== "scan");
  getById("demoModeWrap")?.classList.toggle("hidden", mode !== "demo");

  if (mode !== "scan" && state.html5QrCode && state.scannerRunning) {
    state.html5QrCode.stop().catch(() => {});
    state.scannerRunning = false;
  }

  if (mode === "demo") {
    setReceiver(RECEIVER_ID);
    setResult(getById("paymentResult"), "Demo receiver selected. Enter amount.", "muted");
  } else {
    state.receiverId = null;
    getById("receiverText").textContent = "Not selected";
    setResult(getById("paymentResult"), "Scan QR code to continue.", "muted");
    updateProgress("receiver");
    updateContinueButton();
  }

  setActivePayStep("amount");
  getById("pinInput").value = "";
  state.pendingAmount = 0;
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
  const status = getById("autoConnectStatus");

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
    const sender = getById("senderBalance");
    const machine = getById("machineBalance");
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
  const stage = getById("cashStage");
  if (!stage) return;

  setNoteLabels(amount);
  stage.classList.remove("hidden", "active");
  void stage.offsetWidth;
  setTimeout(() => stage.classList.add("active"), 180);
}

function onPaymentReceived(payload) {
  const amount = Number(payload.amount || 0);
  const status = getById("statusText");
  const machine = getById("machineBalance");

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
    const status = getById("statusText");
    if (status) status.textContent = "Realtime link unavailable.";
  });
}

function buildDispense() {
  if (!state.qrBuilt) {
    const qr = getById("qrcode");
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

function updateContinueButton() {
  const continueBtn = getById("continueToPinBtn");
  const amount = Number(getById("amountInput")?.value || 0);
  if (continueBtn) {
    continueBtn.disabled = !state.receiverId || amount <= 0;
  }
}

function setReceiver(receiverId) {
  state.receiverId = receiverId;
  const receiverText = getById("receiverText");
  if (receiverText) receiverText.textContent = receiverId;

  updateContinueButton();
  updateProgress("amount");
}

async function ensureCameraPermission() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Camera API unsupported");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  stream.getTracks().forEach((track) => track.stop());
  state.cameraGranted = true;
}

async function onScanSuccess(decodedText) {
  try {
    const parsed = JSON.parse(decodedText);
    if (!parsed.receiver) throw new Error("Invalid qr");

    setReceiver(parsed.receiver);
    setResult(getById("paymentResult"), "QR scanned. Enter amount and continue.", "success");

    if (state.html5QrCode && state.scannerRunning) {
      await state.html5QrCode.stop();
      state.scannerRunning = false;
    }
  } catch {
    setResult(getById("paymentResult"), "Invalid QR data", "error");
  }
}

async function requestCameraAccess() {
  const result = getById("paymentResult");

  if (!window.isSecureContext) {
    setResult(result, "Camera needs secure context (HTTPS).", "error");
    return;
  }

  try {
    await ensureCameraPermission();
    setResult(result, "Camera permission granted. Start scanner.", "success");
  } catch {
    setResult(result, "Camera permission denied. Enable it in browser settings.", "error");
  }
}

async function startScanner() {
  const result = getById("paymentResult");

  if (!state.backendUrl) {
    setResult(result, "Backend unavailable. Refresh after server starts.", "error");
    return;
  }

  if (!window.isSecureContext) {
    setResult(result, "Camera needs secure context (HTTPS).", "error");
    return;
  }

  try {
    if (!state.cameraGranted) {
      await ensureCameraPermission();
    }
  } catch {
    setResult(result, "Allow camera permission first.", "error");
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
    const cameras = await Html5Qrcode.getCameras();
    const rear = cameras.find((cam) => /back|rear|environment/i.test(cam.label || ""));
    const preferredCameraId = (rear || cameras[0])?.id;

    if (!preferredCameraId) {
      setResult(result, "No camera found on this device.", "error");
      return;
    }

    await state.html5QrCode.start(
      preferredCameraId,
      { fps: 10, qrbox: 220 },
      onScanSuccess,
      () => {}
    );

    state.scannerRunning = true;
    setResult(result, "Scanner active. Point camera at QR.", "muted");
  } catch {
    setResult(result, "Camera unavailable. Use Demo Mode instead.", "error");
  }
}

function continueToPin() {
  const result = getById("paymentResult");
  const amount = Number(getById("amountInput")?.value || 0);

  if (!state.receiverId) {
    setResult(result, "Select a receiver first.", "error");
    return;
  }

  if (!amount || amount <= 0) {
    setResult(result, "Enter valid amount.", "error");
    return;
  }

  state.pendingAmount = amount;
  setActivePayStep("pin");
  updateProgress("pin");
  setResult(result, "Enter 6-digit PIN to confirm payment.", "muted");
  getById("pinInput")?.focus();
}

function showPulse(show) {
  const pulse = getById("paymentPulse");
  if (!pulse) return;
  pulse.classList.toggle("hidden", !show);
}

function showSuccess(amount, receiverId) {
  const card = getById("successCard");
  const text = getById("successAmount");
  if (!card || !text) return;

  text.textContent = `${formatInr(amount)} sent to ${receiverId}`;
  card.classList.remove("hidden");
  setTimeout(() => card.classList.add("hidden"), 2400);
}

function renderRecentPayments() {
  const list = getById("recentList");
  if (!list) return;

  list.innerHTML = "";
  if (state.recentPayments.length === 0) {
    list.innerHTML = "<li class=\"muted\">No payments yet.</li>";
    return;
  }

  state.recentPayments.slice(0, 5).forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = `${entry.time} - ${formatInr(entry.amount)} to ${entry.to}`;
    list.appendChild(li);
  });
}

async function confirmPayment() {
  const pinInput = getById("pinInput");
  const pin = pinInput?.value?.trim() || "";
  const result = getById("paymentResult");

  if (pin.length !== 6) {
    setResult(result, "PIN must be 6 digits.", "error");
    return;
  }

  if (pin !== DEMO_PIN) {
    pinInput?.classList.add("shake");
    setTimeout(() => pinInput?.classList.remove("shake"), 350);
    setResult(result, "Incorrect PIN. Use 123456 for prototype.", "error");
    return;
  }

  if (!state.pendingAmount || !state.receiverId) {
    setResult(result, "Payment details missing.", "error");
    return;
  }

  try {
    showPulse(true);
    const data = await fetchJson("/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "user1",
        to: state.receiverId,
        amount: state.pendingAmount,
      }),
    });

    setResult(result, `Payment successful: ${formatInr(data.amount)}`, "success");
    const sender = getById("senderBalance");
    if (sender) sender.textContent = formatInr(data.sender_balance);

    getById("amountInput").value = "";
    getById("pinInput").value = "";
    showSuccess(data.amount, state.receiverId);
    updateProgress("done");

    state.recentPayments.unshift({
      amount: data.amount,
      to: state.receiverId,
      time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    });
    renderRecentPayments();

    state.pendingAmount = 0;
    setActivePayStep("amount");
    updateContinueButton();
  } catch (error) {
    setResult(result, error.message || "Payment failed", "error");
  } finally {
    showPulse(false);
  }
}

let payInitialized = false;
function initPayControls() {
  if (payInitialized) {
    loadBalances();
    return;
  }

  getById("modeScanBtn")?.addEventListener("click", () => togglePayMode("scan"));
  getById("modeDemoBtn")?.addEventListener("click", () => togglePayMode("demo"));

  getById("requestCamBtn")?.addEventListener("click", requestCameraAccess);
  getById("startScanBtn")?.addEventListener("click", startScanner);
  getById("useDemoReceiverBtn")?.addEventListener("click", () => {
    setReceiver(RECEIVER_ID);
    setResult(getById("paymentResult"), "Demo receiver selected. Enter amount.", "success");
  });

  getById("amountInput")?.addEventListener("input", updateContinueButton);
  getById("continueToPinBtn")?.addEventListener("click", continueToPin);
  getById("confirmPayBtn")?.addEventListener("click", confirmPayment);

  togglePayMode("scan");
  updateProgress("receiver");
  renderRecentPayments();
  loadBalances();
  payInitialized = true;
}

function wireNavigation() {
  document.querySelectorAll(".step-tab").forEach((tab) => {
    tab.addEventListener("click", () => setSection(tab.dataset.target));
  });

  getById("goDispenseBtn")?.addEventListener("click", () => setSection("dispenseSection"));
  getById("goPayBtn")?.addEventListener("click", () => setSection("paySection"));
}

(async function init() {
  wireNavigation();
  await autoConnectBackend();
  buildDispense();
  initPayControls();
})();
