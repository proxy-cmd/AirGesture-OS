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
};

function el(id) {
  return document.getElementById(id);
}

function formatInr(amount) {
  return `${RUPEE}${Number(amount || 0).toLocaleString("en-IN")}`;
}

function setResult(msg, cls = "muted") {
  const target = el("paymentResult");
  if (!target) return;
  target.textContent = msg;
  target.className = `result-text ${cls}`;
}

function openCameraHelpModal() {
  if (state.activeSection !== "paySection" || state.payMode !== "scan") {
    return;
  }

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
  }

  if (targetId === "dispenseSection") {
    buildDispense();
  }

  if (targetId === "paySection") {
    initPayControls();
  }
}

function setActivePayStep(step) {
  el("amountStep")?.classList.toggle("active", step === "amount");
  el("pinStep")?.classList.toggle("active", step === "pin");
}

function revealScanPayFlow(show) {
  el("scanPayFlow")?.classList.toggle("hidden", !show);
}

function resetPaySteps() {
  state.pendingAmount = 0;
  el("amountInput").value = "";
  el("pinInput").value = "";
  setActivePayStep("amount");
  revealScanPayFlow(false);
  el("continueToPinBtn").disabled = true;
  el("successCard")?.classList.add("hidden");
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

  if (mode === "demo") {
    setReceiver(RECEIVER_ID);
    revealScanPayFlow(true);
    setResult("Demo receiver selected. Enter amount.", "muted");
  } else {
    state.receiverId = null;
    el("receiverText").textContent = "Not selected";
    setResult("Scan QR to begin payment flow.", "muted");
    resetPaySteps();
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
    if (el("senderBalance")) el("senderBalance").textContent = formatInr(data.user1);
    if (el("machineBalance")) el("machineBalance").textContent = formatInr(data.machine_001);
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
  const stage = el("cashStage");
  if (!stage) return;

  setNoteLabels(amount);
  stage.classList.remove("hidden", "active");
  void stage.offsetWidth;
  setTimeout(() => stage.classList.add("active"), 180);
}

function onPaymentReceived(payload) {
  const amount = Number(payload.amount || 0);
  if (el("statusText")) el("statusText").textContent = `${formatInr(amount)} received`;
  if (el("machineBalance") && typeof payload.machine_balance === "number") {
    el("machineBalance").textContent = formatInr(payload.machine_balance);
  }

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
}

function updateContinueButton() {
  const amount = Number(el("amountInput")?.value || 0);
  const btn = el("continueToPinBtn");
  if (btn) btn.disabled = !state.receiverId || amount <= 0;
}

function setReceiver(receiverId) {
  state.receiverId = receiverId;
  if (el("receiverText")) el("receiverText").textContent = receiverId;
  revealScanPayFlow(true);
  setActivePayStep("amount");
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
    setResult("QR scanned. Enter amount.", "success");

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
    if (!state.cameraGranted) {
      await ensureCameraPermission();
    }
  } catch {
    setResult("Camera permission denied.", "error");
    openCameraHelpModal();
    return;
  }

  if (!state.html5QrCode) {
    state.html5QrCode = new Html5Qrcode("reader");
  }

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
  setActivePayStep("pin");
  setResult("Enter 6-digit PIN.", "muted");
  el("pinInput")?.focus();
}

function showPulse(show) {
  const pulse = el("paymentPulse");
  if (!pulse) return;
  pulse.classList.toggle("hidden", !show);
}

function showSuccess(amount, receiverId) {
  const card = el("successCard");
  const amountEl = el("successAmount");
  if (!card || !amountEl) return;

  amountEl.textContent = `${formatInr(amount)} sent to ${receiverId}`;
  card.classList.remove("hidden");
  setTimeout(() => card.classList.add("hidden"), 2500);
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
    showPulse(true);
    await new Promise((resolve) => setTimeout(resolve, 1300));

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

    showSuccess(data.amount, state.receiverId);
    el("amountInput").value = "";
    el("pinInput").value = "";
    state.pendingAmount = 0;
    setActivePayStep("amount");
    updateContinueButton();
  } catch (error) {
    setResult(error.message || "Payment failed", "error");
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

  el("modeScanBtn")?.addEventListener("click", () => togglePayMode("scan"));
  el("modeDemoBtn")?.addEventListener("click", () => togglePayMode("demo"));

  el("requestCamBtn")?.addEventListener("click", requestCameraAccess);
  el("startScanBtn")?.addEventListener("click", startScanner);
  el("useDemoReceiverBtn")?.addEventListener("click", () => {
    setReceiver(RECEIVER_ID);
    setResult("Demo receiver selected. Enter amount.", "success");
  });

  el("continueToPinBtn")?.addEventListener("click", continueToPin);
  el("confirmPayBtn")?.addEventListener("click", confirmPayment);
  el("amountInput")?.addEventListener("input", updateContinueButton);

  el("retryPermissionBtn")?.addEventListener("click", requestCameraAccess);
  el("closeModalBtn")?.addEventListener("click", closeCameraHelpModal);

  togglePayMode("scan");
  setActivePayStep("amount");
  loadBalances();
  payInitialized = true;
}

function wireNavigation() {
  document.querySelectorAll(".step-tab").forEach((tab) => {
    tab.addEventListener("click", () => setSection(tab.dataset.target));
  });

  el("goDispenseBtn")?.addEventListener("click", () => setSection("dispenseSection"));
  el("goPayBtn")?.addEventListener("click", () => setSection("paySection"));

  const modal = el("cameraHelpModal");
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeCameraHelpModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCameraHelpModal();
    }
  });
}

(async function init() {
  wireNavigation();
  await autoConnectBackend();
  buildDispense();
  initPayControls();
})();
