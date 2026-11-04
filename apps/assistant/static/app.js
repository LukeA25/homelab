const phaseEl = document.getElementById("phase");
const heardEl = document.getElementById("heard");
const replyEl = document.getElementById("reply");
const metaEl = document.getElementById("meta");
const ptt = document.getElementById("ptt");
const tokenInput = document.getElementById("token");
const textForm = document.getElementById("text-form");
const textInput = document.getElementById("text-input");
const cursorModal = document.getElementById("cursor-modal");
const cursorBackdrop = document.getElementById("cursor-backdrop");
const cursorCard = document.getElementById("cursor-card");
const cursorPrompt = document.getElementById("cursor-prompt");
const cursorStatus = document.getElementById("cursor-status");
const cursorConfirm = document.getElementById("cursor-confirm");
const cursorCancel = document.getElementById("cursor-cancel");
const cursorBadge = document.getElementById("cursor-badge");
const cursorTitle = document.getElementById("cursor-title");
const cursorActions = document.getElementById("cursor-actions");

let mediaRecorder = null;
let chunks = [];
let recording = false;
let pendingProposalId = null;
let audioPlayer = null;

function sessionId() {
  const key = "assistant_session_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function token() {
  return tokenInput.value.trim() || "dev-token-change-me";
}

function setPhase(name) {
  phaseEl.textContent = name;
  phaseEl.className = "phase " + String(name).toLowerCase().replace(/\s+/g, "");
}

function authHeaders() {
  return {
    "X-Assistant-Token": token(),
    "X-Session-Id": sessionId(),
  };
}

function playAudioBase64(b64, mime) {
  if (audioPlayer) {
    audioPlayer.pause();
    audioPlayer = null;
  }
  const src = `data:${mime || "audio/mpeg"};base64,${b64}`;
  audioPlayer = new Audio(src);
  audioPlayer.play().catch(() => {});
}

function showResult(result) {
  heardEl.textContent = result.transcript
    ? `“${result.transcript}”`
    : "No speech detected.";
  replyEl.textContent = result.reply || "";
  const actionBits = (result.actions || [])
    .map((a) => `${a.ok ? "✓" : "✗"} ${a.tool}`)
    .join(" · ");
  metaEl.textContent = [
    result.elapsed_ms != null ? `${result.elapsed_ms} ms` : null,
    actionBits || null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (result.audio_base64) {
    playAudioBase64(result.audio_base64, result.audio_mime);
  }
  if (result.cursor_proposal && result.cursor_proposal.id) {
    showProposal(result.cursor_proposal);
  }
  setPhase("Idle");
}

async function startRecording() {
  if (recording) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: mime });
    await sendAudio(blob);
  };
  mediaRecorder.start();
  recording = true;
  ptt.classList.add("recording");
  setPhase("Listening");
  heardEl.textContent = "Listening…";
  replyEl.textContent = "";
  metaEl.textContent = "";
}

function stopRecording() {
  if (!recording || !mediaRecorder) return;
  recording = false;
  ptt.classList.remove("recording");
  setPhase("Thinking");
  mediaRecorder.stop();
  mediaRecorder = null;
}

async function sendAudio(blob) {
  setPhase("Uploading");
  const form = new FormData();
  form.append("audio", blob, "speech.webm");
  form.append("session_id", sessionId());
  try {
    const res = await fetch("/api/turn", {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || res.statusText);
    showResult(data);
  } catch (err) {
    setPhase("Error");
    replyEl.textContent = String(err.message || err);
  }
}

ptt.addEventListener("click", async (e) => {
  e.preventDefault();
  if (recording) {
    stopRecording();
    return;
  }
  try {
    await startRecording();
  } catch (err) {
    setPhase("Error");
    replyEl.textContent = "Mic permission failed: " + err.message;
  }
});

textForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (!text) return;
  setPhase("Thinking");
  heardEl.textContent = `“${text}”`;
  replyEl.textContent = "";
  try {
    const res = await fetch("/api/turn/text", {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, session_id: sessionId() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || res.statusText);
    showResult(data);
    textInput.value = "";
  } catch (err) {
    setPhase("Error");
    replyEl.textContent = String(err.message || err);
  }
});

document.getElementById("clear-chat")?.addEventListener("click", async () => {
  try {
    await fetch("/api/session/clear", { method: "POST", headers: authHeaders() });
    heardEl.textContent = "Chat memory cleared.";
    replyEl.textContent = "";
    metaEl.textContent = "";
    setPhase("Idle");
  } catch (err) {
    replyEl.textContent = String(err.message || err);
  }
});

cursorConfirm.addEventListener("click", async () => {
  if (!pendingProposalId) return;
  setCursorBusy("Starting Cursor agent…");
  const res = await fetch(`/api/cursor/proposals/${pendingProposalId}/confirm`, {
    method: "POST",
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    setCursorBusy(data.detail || "Confirm failed", "error");
    return;
  }
  setCursorBusy("Running… (this can take a minute)", "running");
  pollProposalUntilDone(pendingProposalId);
});

cursorCancel.addEventListener("click", async () => {
  if (!pendingProposalId) return;
  const res = await fetch(`/api/cursor/proposals/${pendingProposalId}/cancel`, {
    method: "POST",
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    setCursorBusy(data.detail || "Cancel failed", "error");
    return;
  }
  if (data.status === "cancelled") {
    pendingProposalId = null;
    hideCursorModal();
  } else {
    setCursorBusy(`Left as ${data.status}.`, data.status);
  }
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Light markdown → HTML for Cursor agent summaries. */
function formatCursorResult(text) {
  const escaped = escapeHtml(text.trim());
  const withInline = escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  const blocks = withInline.split(/\n{2,}/);
  return blocks
    .map((block, i) => {
      const html = block.replace(/\n/g, "<br>");
      const cls = i === 0 ? ' class="cursor-lede"' : "";
      return `<p${cls}>${html}</p>`;
    })
    .join("");
}

function setCursorBusy(message, status = "running") {
  if (cursorBadge) {
    cursorBadge.textContent = status;
    cursorBadge.className = `cursor-badge ${status}`;
  }
  if (cursorTitle) cursorTitle.textContent = "Cursor edit";
  if (cursorActions) cursorActions.hidden = status !== "pending";
  cursorStatus.hidden = false;
  cursorStatus.innerHTML = `<p class="cursor-lede">${escapeHtml(message)}</p>`;
}

function hideCursorModal() {
  if (!cursorModal) return;
  cursorModal.hidden = true;
  cursorModal.setAttribute("aria-hidden", "true");
}

function openCursorModal() {
  if (!cursorModal) return;
  cursorModal.hidden = false;
  cursorModal.setAttribute("aria-hidden", "false");
}

function currentProposalStatus() {
  return cursorBadge?.textContent?.trim() || "pending";
}

function dismissCursorModal() {
  const status = currentProposalStatus();
  if (status === "done" || status === "error" || status === "cancelled") {
    pendingProposalId = null;
    hideCursorModal();
  }
}

function showProposal(p) {
  pendingProposalId = p.id;
  openCursorModal();
  cursorPrompt.textContent = p.prompt || "";
  const status = p.status || "pending";
  if (cursorBadge) {
    cursorBadge.textContent = status;
    cursorBadge.className = `cursor-badge ${status}`;
  }
  if (cursorTitle) {
    cursorTitle.textContent =
      status === "pending"
        ? "Cursor edit pending"
        : status === "running"
          ? "Cursor edit running"
          : status === "done"
            ? "Cursor edit done"
            : status === "error"
              ? "Cursor edit failed"
              : "Cursor edit";
  }
  if (cursorActions) cursorActions.hidden = status !== "pending";

  if (status === "pending") {
    cursorStatus.hidden = true;
    cursorStatus.innerHTML = "";
  } else if (status === "running") {
    cursorStatus.hidden = false;
    cursorStatus.innerHTML = `<p class="cursor-lede">Running… (this can take a minute)</p>`;
  } else if (status === "done") {
    cursorStatus.hidden = false;
    cursorStatus.innerHTML = p.result
      ? formatCursorResult(p.result.slice(0, 2000))
      : `<p class="cursor-lede">Done.</p>`;
  } else if (status === "error") {
    cursorStatus.hidden = false;
    cursorStatus.innerHTML = `<p class="cursor-lede"><strong>Error:</strong> ${escapeHtml(p.error || "unknown")}</p>`;
  } else if (status === "cancelled") {
    pendingProposalId = null;
    hideCursorModal();
    return;
  } else {
    cursorStatus.hidden = false;
    cursorStatus.innerHTML = `<p>Status: ${escapeHtml(status)}</p>`;
  }
}

async function pollProposalUntilDone(id) {
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch("/api/cursor/proposals", { headers: authHeaders() });
      if (!res.ok) continue;
      const data = await res.json();
      const p = (data.proposals || []).find((x) => x.id === id);
      if (!p) continue;
      showProposal(p);
      if (p.status === "done" || p.status === "error" || p.status === "cancelled") return;
    } catch {
      /* ignore */
    }
  }
  setCursorBusy("Still running — check back in a bit, or refresh.", "running");
}

// Poll proposals so voice proposals and running jobs stay visible.
async function refreshProposals() {
  try {
    const res = await fetch("/api/cursor/proposals", { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const list = data.proposals || [];
    const active =
      list.find((p) => p.status === "pending") ||
      list.find((p) => p.status === "running") ||
      (pendingProposalId ? list.find((p) => p.id === pendingProposalId) : null);
    if (active) showProposal(active);
  } catch {
    /* ignore */
  }
}

cursorBackdrop?.addEventListener("click", () => {
  const status = currentProposalStatus();
  if (status === "done" || status === "error") {
    dismissCursorModal();
  } else if (status === "pending") {
    cursorCancel.click();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || cursorModal?.hidden) return;
  const status = currentProposalStatus();
  if (status === "done" || status === "error") {
    dismissCursorModal();
  } else if (status === "pending") {
    cursorCancel.click();
  }
});

refreshProposals();
setInterval(refreshProposals, 4000);

async function refreshHealth() {
  const el = document.getElementById("health-line");
  if (!el) return;
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    const bits = [];
    bits.push(data.openai_configured ? "OpenAI ready" : "Set OPENAI_API_KEY in compose/assistant/.env");
    bits.push(data.ha_configured ? "HA ready" : "Set HA_TOKEN (same as dashboard)");
    bits.push(data.cursor_configured ? "Cursor ready" : "Cursor optional");
    el.textContent = bits.join(" · ");
  } catch {
    el.textContent = "Assistant unreachable";
  }
}
refreshHealth();
setInterval(refreshHealth, 15000);
