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
  activeSection: "homeSection",
  txIds: new Set(),
};

function el(id) {
  return document.getElementById(id);
}

function formatInr(amount) {
  return `${RUPEE}${Number(amount || 0).toLocaleString("en-IN")}`;
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--:--";
  }
}

function setResult(msg, cls = "muted") {
  const target = el("paymentResult");
  if (!target) return;
  target.textContent = msg;
  target.className = `result-text ${cls}`;
}

function openCameraHelpModal() {
  if (state.activeSection !== "paySection" || state.payMode !== "scan") return;
  const modal = el("cameraHelpModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeCameraHelpModal() {
  const modal = el("cameraHelpModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function openPayFlowModal() {
  const modal = el("payFlowModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  setFlowStep("amount");
  setTimeout(() => el("amountInput")?.focus(), 150);
}

function closePayFlowModal() {
  const modal = el("payFlowModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");

  state.pendingAmount = 0;
  if (el("amountInput")) el("amountInput").value = "";
  if (el("pinInput")) el("pinInput").value = "";
}

function setFlowStep(step) {
  el("flowAmountStep")?.classList.toggle("active", step === "amount");
  el("flowPinStep")?.classList.toggle("active", step === "pin");
  el("flowProcessingStep")?.classList.toggle("active", step === "processing");
  el("flowSuccessStep")?.classList.toggle("active", step === "success");
}

function setSection(targetId) {
  if (targetId !== "paySection" && state.html5QrCode && state.scannerRunning) {
    state.html5QrCode.stop().catch(() => {});
    state.scannerRunning = false;
  }

  document.querySelectorAll(".section").forEach((section) => {
    section.classList.toggle("active", section.id === targetId);
  });
  state.activeSection = targetId;

  document.querySelectorAll(".step-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.target === targetId);
  });

  if (targetId !== "paySection") {
    closeCameraHelpModal();
    closePayFlowModal();
  }

  if (targetId === "dispenseSection") buildDispense();
  if (targetId === "paySection") initPayControls();
}

function togglePayMode(mode) {
  state.payMode = mode;

  el("modeScanBtn")?.classList.toggle("active", mode === "scan");
  el("modeDemoBtn")?.classList.toggle("active", mode === "demo");
  el("scanModeWrap")?.classList.toggle("hidden", mode !== "scan");
  el("demoModeWrap")?.classList.toggle("hidden", mode !== "demo");

  if (mode !== "scan" && state.html5QrCode && state.scannerRunning) {
    state.html5QrCode.stop().catch(() => {});
    state.scannerRunning = false;
  }

  state.receiverId = null;
  if (el("receiverText")) el("receiverText").textContent = "Not selected";

  if (mode === "scan") {
    setResult("Scan QR to begin payment flow.", "muted");
  } else {
    setResult("Demo mode active. Tap Use Demo Receiver.", "muted");
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
  const status = el("autoConnectStatus");

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
  if (!state.backendUrl) throw new Error("Backend unavailable");
  const res = await fetch(`${state.backendUrl}${path}`, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Request failed");
  return data;
}

async function loadBalances() {
  try {
    const data = await fetchJson("/accounts");
    if (el("senderBalance")) el("senderBalance").textContent = formatInr(data.user1);
    if (el("machineBalance")) el("machineBalance").textContent = formatInr(data.machine_001);
  } catch {}
}

const txData = [];
function addTransaction(entry) {
  if (!entry || !entry.id || state.txIds.has(entry.id)) return;
  state.txIds.add(entry.id);
  txData.unshift(entry);

  const trimmed = txData.slice(0, 10);
  txData.length = 0;
  txData.push(...trimmed);

  const list = el("txList");
  if (!list) return;
  list.innerHTML = "";
  txData.forEach((tx) => {
    const li = document.createElement("li");
    li.textContent = `${formatTime(tx.timestamp)} - ${formatInr(tx.amount)} from ${tx.from}`;
    list.appendChild(li);
  });
}

async function loadTransactions() {
  try {
    const rows = await fetchJson("/transactions");
    rows.forEach((row) => addTransaction(row));
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
  const values = [Math.ceil(amount / 3), Math.floor(amount / 3), amount - Math.ceil(amount / 3) - Math.floor(amount / 3)].filter((x) => x > 0);
  const notes = Array.from(document.querySelectorAll("#cashStage .note"));
  notes.forEach((note, i) => {
    const fallback = values[values.length - 1] || amount;
    note.textContent = `${RUPEE}${values[i] || fallback}`;
  });
}

function triggerCashAnimation(amount) {
  const stage = el("cashStage");
  if (!stage) return;

  setNoteLabels(amount);
  stage.classList.remove("hidden", "active");
  void stage.offsetWidth;
  setTimeout(() => stage.classList.add("active"), 170);
}

function onPaymentReceived(payload) {
  const amount = Number(payload.amount || 0);
  if (el("statusText")) el("statusText").textContent = `${formatInr(amount)} received`;
  if (el("machineBalance") && typeof payload.machine_balance === "number") {
    el("machineBalance").textContent = formatInr(payload.machine_balance);
  }

  addTransaction(payload);
  triggerCashAnimation(amount);
  playSuccessBeep();
}

function connectSocket() {
  if (state.socket || !state.backendUrl) return;

  state.socket = io(state.backendUrl, { transports: ["websocket", "polling"] });
  state.socket.on("payment_received", onPaymentReceived);
  state.socket.on("connect_error", () => {
    if (el("statusText")) el("statusText").textContent = "Realtime link unavailable.";
  });
}

function buildDispense() {
  if (!state.qrBuilt) {
    const qr = el("qrcode");
    if (qr) {
      new QRCode(qr, {
        text: JSON.stringify({ receiver: RECEIVER_ID }),
        width: 220,
        height: 220,
        colorDark: "#1f2937",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });
      state.qrBuilt = true;
    }
  }

  connectSocket();
  loadBalances();
  loadTransactions();
}

function updateContinueButton() {
  const amount = Number(el("amountInput")?.value || 0);
  const btn = el("continueToPinBtn");
  if (btn) btn.disabled = !state.receiverId || amount <= 0;
}

function setReceiver(receiverId) {
  state.receiverId = receiverId;
  if (el("receiverText")) el("receiverText").textContent = receiverId;
  if (el("flowTitle")) el("flowTitle").textContent = `Pay To ${receiverId}`;

  setFlowStep("amount");
  openPayFlowModal();
  updateContinueButton();
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
    if (!parsed.receiver) throw new Error("Invalid QR");

    setReceiver(parsed.receiver);
    setResult("QR scanned successfully.", "success");

    if (state.html5QrCode && state.scannerRunning) {
      await state.html5QrCode.stop();
      state.scannerRunning = false;
    }
  } catch {
    setResult("Invalid QR data", "error");
  }
}

async function requestCameraAccess() {
  if (!window.isSecureContext) {
    setResult("Camera needs secure context (HTTPS).", "error");
    return;
  }

  try {
    await ensureCameraPermission();
    closeCameraHelpModal();
    setResult("Camera permission granted. Start scanner.", "success");
  } catch {
    setResult("Camera permission denied.", "error");
  }
}

async function startScanner() {
  if (!state.backendUrl) {
    setResult("Backend unavailable. Refresh after server starts.", "error");
    return;
  }

  if (!window.isSecureContext) {
    setResult("Camera needs secure context (HTTPS).", "error");
    openCameraHelpModal();
    return;
  }

  try {
    if (!state.cameraGranted) await ensureCameraPermission();
  } catch {
    setResult("Camera permission denied.", "error");
    openCameraHelpModal();
    return;
  }

  if (!state.html5QrCode) state.html5QrCode = new Html5Qrcode("reader");
  if (state.scannerRunning) {
    setResult("Scanner already running.", "muted");
    return;
  }

  try {
    const cameras = await Html5Qrcode.getCameras();
    const rear = cameras.find((cam) => /back|rear|environment/i.test(cam.label || ""));
    const preferredId = (rear || cameras[0])?.id;

    if (!preferredId) {
      setResult("No camera found.", "error");
      return;
    }

    await state.html5QrCode.start(preferredId, { fps: 10, qrbox: 220 }, onScanSuccess, () => {});
    state.scannerRunning = true;
    setResult("Scanner active. Point at QR.", "muted");
  } catch {
    setResult("Camera unavailable. Use Demo Mode.", "error");
  }
}

function continueToPin() {
  const amount = Number(el("amountInput")?.value || 0);
  if (!state.receiverId) {
    setResult("Scan receiver QR first.", "error");
    return;
  }

  if (!amount || amount <= 0) {
    setResult("Enter valid amount.", "error");
    return;
  }

  state.pendingAmount = amount;
  setFlowStep("pin");
  setResult("Enter 6-digit PIN.", "muted");
  setTimeout(() => el("pinInput")?.focus(), 120);
}

function showSuccess(amount, receiverId) {
  const amountEl = el("successAmount");
  if (amountEl) amountEl.textContent = `${formatInr(amount)} sent to ${receiverId}`;
  setFlowStep("success");
}

async function confirmPayment() {
  const pinInput = el("pinInput");
  const pin = pinInput?.value?.trim() || "";

  if (pin.length !== 6) {
    setResult("PIN must be 6 digits.", "error");
    return;
  }

  if (pin !== DEMO_PIN) {
    pinInput?.classList.add("shake");
    setTimeout(() => pinInput?.classList.remove("shake"), 350);
    setResult("Incorrect PIN. Use 123456.", "error");
    return;
  }

  if (!state.pendingAmount || !state.receiverId) {
    setResult("Payment details missing.", "error");
    return;
  }

  try {
    setFlowStep("processing");
    await new Promise((resolve) => setTimeout(resolve, 1450));

    const data = await fetchJson("/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "user1",
        to: state.receiverId,
        amount: state.pendingAmount,
      }),
    });

    setResult(`Payment successful: ${formatInr(data.amount)}`, "success");
    if (el("senderBalance")) el("senderBalance").textContent = formatInr(data.sender_balance);

    addTransaction(data);
    showSuccess(data.amount, state.receiverId);
    state.pendingAmount = 0;
  } catch (error) {
    setResult(error.message || "Payment failed", "error");
    setFlowStep("pin");
  }
}

function finishPaymentFlow() {
  closePayFlowModal();
  state.pendingAmount = 0;
  if (el("amountInput")) el("amountInput").value = "";
  if (el("pinInput")) el("pinInput").value = "";
}

let payInitialized = false;
function initPayControls() {
  if (payInitialized) {
    loadBalances();
    return;
  }

  el("modeScanBtn")?.addEventListener("click", () => togglePayMode("scan"));
  el("modeDemoBtn")?.addEventListener("click", () => togglePayMode("demo"));

  el("requestCamBtn")?.addEventListener("click", requestCameraAccess);
  el("startScanBtn")?.addEventListener("click", startScanner);
  el("useDemoReceiverBtn")?.addEventListener("click", () => {
    setReceiver(RECEIVER_ID);
    setResult("Demo receiver selected.", "success");
  });

  el("amountInput")?.addEventListener("input", updateContinueButton);
  el("continueToPinBtn")?.addEventListener("click", continueToPin);
  el("confirmPayBtn")?.addEventListener("click", confirmPayment);

  el("donePayFlowBtn")?.addEventListener("click", finishPaymentFlow);
  el("closePayFlowBtn")?.addEventListener("click", closePayFlowModal);

  el("retryPermissionBtn")?.addEventListener("click", requestCameraAccess);
  el("closeModalBtn")?.addEventListener("click", closeCameraHelpModal);

  togglePayMode("scan");
  loadBalances();
  payInitialized = true;
}

function wireNavigation() {
  document.querySelectorAll(".step-tab").forEach((tab) => {
    tab.addEventListener("click", () => setSection(tab.dataset.target));
  });

  el("goDispenseBtn")?.addEventListener("click", () => setSection("dispenseSection"));
  el("goPayBtn")?.addEventListener("click", () => setSection("paySection"));

  const cameraModal = el("cameraHelpModal");
  cameraModal?.addEventListener("click", (event) => {
    if (event.target === cameraModal) closeCameraHelpModal();
  });

  const payModal = el("payFlowModal");
  payModal?.addEventListener("click", (event) => {
    if (event.target === payModal) closePayFlowModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCameraHelpModal();
      closePayFlowModal();
    }
  });
}

(async function init() {
  wireNavigation();
  await autoConnectBackend();
  buildDispense();
  initPayControls();
})();
