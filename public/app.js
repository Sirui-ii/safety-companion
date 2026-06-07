const form = document.querySelector("#ideaForm");
const statusEl = document.querySelector("#status");
const phoneEl = document.querySelector("#phone");
const oneLinerEl = document.querySelector("#oneLiner");
const scriptEl = document.querySelector("#script");
const questionsEl = document.querySelector("#questions");
const deckEl = document.querySelector("#deck");
const rubricEl = document.querySelector("#rubric");
const transcriptEl = document.querySelector("#transcript");
const feedbackEl = document.querySelector("#feedback");
const scoreEl = document.querySelector("#score");
const levelEl = document.querySelector("#level");
const copyScript = document.querySelector("#copyScript");
const startPractice = document.querySelector("#startPractice");
const stopPractice = document.querySelector("#stopPractice");
const evaluatePractice = document.querySelector("#evaluatePractice");
const companionQuestion = document.querySelector("#companionQuestion");
const askInvestor = document.querySelector("#askInvestor");
const companionAnswer = document.querySelector("#companionAnswer");
const soundBed = document.querySelector("#soundBed");
const lockIn = document.querySelector("#lockIn");
const lockScreen = document.querySelector("#lockScreen");
const exitLock = document.querySelector("#exitLock");
const lockMic = document.querySelector("#lockMic");
const lockAsk = document.querySelector("#lockAsk");
const lockMusic = document.querySelector("#lockMusic");
const luckyMeal = document.querySelector("#luckyMeal");
const lockScript = document.querySelector("#lockScript");
const lockLine = document.querySelector("#lockLine");
const lockScore = document.querySelector("#lockScore");
const lockLevel = document.querySelector("#lockLevel");
const jumpCheckIn = document.querySelector("#jumpCheckIn");
const jumpMemory = document.querySelector("#jumpMemory");
const summarizeContext = document.querySelector("#summarizeContext");
const contextSummary = document.querySelector("#contextSummary");

let currentPlan = null;
let recognition = null;
let listening = false;
let audioContext = null;
let ambientNodes = [];
let rhythmTimer = null;
let activeSoundMode = "aurora";

init();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(form.querySelector("button"), "Creating...");
  try {
    const plan = await postJson("/api/generate", Object.fromEntries(new FormData(form)));
    currentPlan = plan;
    renderPlan(plan);
  } catch (error) {
    oneLinerEl.textContent = error.message;
  } finally {
    clearBusy(form.querySelector("button"), "Create safety steps");
  }
});

copyScript.addEventListener("click", async () => {
  if (!currentPlan?.supportScript) return;
  await navigator.clipboard.writeText(currentPlan.supportScript);
  copyScript.textContent = "Copied";
  setTimeout(() => (copyScript.textContent = "Copy plan"), 1200);
});

startPractice.addEventListener("click", () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    feedbackEl.textContent = "Browser speech recognition is not available here. Paste what is happening and press Reflect.";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = languageToLocale(new FormData(form).get("language"));
  listening = true;
  startPractice.textContent = "Listening...";

  recognition.onresult = (event) => {
    transcriptEl.value = Array.from(event.results)
      .map((result) => result[0]?.transcript || "")
      .join(" ")
      .trim();
  };
  recognition.onend = () => {
    listening = false;
    startPractice.textContent = "Start mic";
  };
  recognition.onerror = (event) => {
    feedbackEl.textContent = `Mic failed: ${event.error}`;
  };
  recognition.start();
});

stopPractice.addEventListener("click", () => {
  if (recognition && listening) recognition.stop();
});

evaluatePractice.addEventListener("click", async () => {
  setBusy(evaluatePractice, "Reflecting...");
  try {
    const reflection = await postJson("/api/evaluate", {
      transcript: transcriptEl.value,
      plan: currentPlan || {}
    });
    renderReflection(reflection);
  } catch (error) {
    feedbackEl.textContent = error.message;
  } finally {
    clearBusy(evaluatePractice, "Reflect");
  }
});

askInvestor.addEventListener("click", async () => {
  setBusy(askInvestor, "Listening...");
  try {
    const reply = await postJson("/api/ask", {
      question: companionQuestion.value,
      persona: "support-companion",
      plan: currentPlan || {}
    });
    companionAnswer.innerHTML = `
      <p>${escapeHtml(reply.answer)}</p>
      <span>${escapeHtml(reply.confidence || "")}</span>
      <small>${escapeHtml(reply.followUp || "")}</small>
    `;
  } catch (error) {
    companionAnswer.textContent = error.message;
  } finally {
    clearBusy(askInvestor, "Ask companion");
  }
});

soundBed.addEventListener("click", async () => {
  if (audioContext) {
    stopSoundBed();
    return;
  }
  await startSoundBed("aurora");
});

lockIn.addEventListener("click", async () => {
  enterLockMode();
  if (!audioContext) await startSoundBed(activeSoundMode);
});

exitLock.addEventListener("click", exitLockMode);
lockMic.addEventListener("click", () => startPractice.click());

lockAsk.addEventListener("click", () => {
  companionQuestion.value = "Give me a safe next-10-minutes plan. I feel overwhelmed and I need something small.";
  askInvestor.click();
  lockLine.textContent = "Next-10-minutes prompt loaded. Keep it small enough to do while tired.";
});

lockMusic.addEventListener("click", async () => switchSoundMode("aurora"));
luckyMeal.addEventListener("click", async () => switchSoundMode("lucky"));

jumpCheckIn?.addEventListener("click", () => {
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.querySelector("textarea")?.focus({ preventScroll: true });
});

jumpMemory?.addEventListener("click", () => {
  document.querySelector("#memoryPanel")?.scrollIntoView({ behavior: "smooth", block: "center" });
});

summarizeContext?.addEventListener("click", async () => {
  setBusy(summarizeContext, "Summarizing...");
  try {
    const summary = await postJson("/api/context-summary", {
      checkIn: Object.fromEntries(new FormData(form)),
      plan: currentPlan || {}
    });
    renderContextSummary(summary);
  } catch (error) {
    contextSummary.textContent = error.message;
  } finally {
    clearBusy(summarizeContext, "Make a small note");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && lockScreen.classList.contains("is-open")) exitLockMode();
});

async function init() {
  const health = await fetch("/api/health").then((response) => response.json()).catch(() => null);
  if (!health) {
    statusEl.textContent = "Server unavailable";
    return;
  }
  statusEl.textContent = [
    health.gateway ? "AI gateway ready" : "Offline support engine",
    health.livekit ? "Voice ready" : "Voice local only"
  ].join(" · ");

  const livekit = await fetch("/api/livekit-config").then((response) => response.json()).catch(() => null);
  phoneEl.textContent = livekit?.phoneNumber
    ? `Voice companion: ${formatPhone(livekit.phoneNumber)}`
    : "Voice companion: configure number";

  form.requestSubmit();
}

function renderPlan(plan) {
  oneLinerEl.textContent = plan.oneLiner || "";
  scriptEl.textContent = plan.supportScript || plan.groundingScript || "";
  questionsEl.innerHTML = `<h3>Gentle Questions</h3>${(plan.questions || [])
    .map((question) => `<p>${escapeHtml(question)}</p>`)
    .join("")}`;
  deckEl.innerHTML = (plan.steps || [])
    .map(
      (step, index) => `
        <article class="slide">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <h3>${escapeHtml(step.title || "Step")}</h3>
          <ul>${(step.actions || []).map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>
          <p>${escapeHtml(step.note || "")}</p>
        </article>
      `
    )
    .join("");
  rubricEl.innerHTML = (plan.orsLoop || [])
    .map((item) => `<div><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.target)}</p></div>`)
    .join("");
  syncLockMode();
}

function renderReflection(reflection) {
  scoreEl.textContent = reflection.score ?? "--";
  levelEl.textContent = reflection.level || "Reflected";
  lockScore.textContent = reflection.score ?? "--";
  lockLevel.textContent = reflection.level || "Connection mode";
  feedbackEl.innerHTML = `
    <h3>${escapeHtml(reflection.fixFirst || "Next safe step")}</h3>
    <p><strong>What I hear:</strong> ${escapeHtml(reflection.strongestMoment || "")}</p>
    <p><strong>Try this:</strong> ${escapeHtml(reflection.nextVersion || "")}</p>
    <div class="drills">${(reflection.drills || []).map((drill) => `<span>${escapeHtml(drill)}</span>`).join("")}</div>
  `;
}

function renderContextSummary(summary) {
  contextSummary.innerHTML = `
    <div>
      <strong>What felt hard</strong>
      <p>${escapeHtml(summary.distressSignal || "")}</p>
    </div>
    <div>
      <strong>What you may need</strong>
      <p>${escapeHtml(summary.need || "")}</p>
    </div>
    <div>
      <strong>What helps a little</strong>
      <p>${escapeHtml(summary.helpers || "")}</p>
    </div>
    <div>
      <strong>Next small step</strong>
      <p>${escapeHtml(summary.nextSafeBehavior || "")}</p>
    </div>
    <small>${escapeHtml(summary.memoryNote || "")}</small>
  `;
}

function enterLockMode() {
  syncLockMode();
  lockScreen.classList.add("is-open");
  lockScreen.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-locked-in");
}

function exitLockMode() {
  lockScreen.classList.remove("is-open");
  lockScreen.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-locked-in");
}

function syncLockMode() {
  lockScript.textContent = currentPlan?.supportScript || "Create a plan, then enter Steady Mode.";
  lockLine.textContent = currentPlan?.oneLiner || "You do not need to solve your whole life tonight. Choose the next safe minute.";
}

async function switchSoundMode(mode) {
  const wasPlaying = Boolean(audioContext);
  if (wasPlaying) stopSoundBed();
  activeSoundMode = mode;
  if (wasPlaying || lockScreen.classList.contains("is-open")) await startSoundBed(mode);
}

async function startSoundBed(mode = "aurora") {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    soundBed.textContent = "No audio";
    return;
  }

  audioContext = new AudioContext();
  await audioContext.resume();
  activeSoundMode = mode;

  const master = audioContext.createGain();
  master.gain.value = mode === "lucky" ? 0.04 : 0.032;
  master.connect(audioContext.destination);

  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = mode === "lucky" ? 1040 : 760;
  filter.Q.value = 0.55;
  filter.connect(master);

  const notes = mode === "lucky" ? [174.61, 220, 293.66, 349.23] : [146.83, 196, 246.94, 329.63];
  ambientNodes = notes.map((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const pan = audioContext.createStereoPanner();

    oscillator.type = mode === "lucky" && index % 2 ? "triangle" : "sine";
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.0001;
    pan.pan.value = [-0.36, 0.32, -0.14, 0.4][index];

    oscillator.connect(gain);
    gain.connect(pan);
    pan.connect(filter);
    oscillator.start();

    const now = audioContext.currentTime;
    gain.gain.linearRampToValueAtTime(mode === "lucky" ? 0.075 : 0.105, now + 2.5 + index * 0.4);
    oscillator.frequency.linearRampToValueAtTime(frequency * 1.003, now + 7 + index);

    return { oscillator, gain, pan };
  });

  if (mode === "lucky") startSoftRhythm(master);

  soundBed.dataset.on = "true";
  soundBed.setAttribute("aria-pressed", "true");
  soundBed.textContent = mode === "lucky" ? "Social spark on" : "Calm audio on";
  lockMusic.dataset.active = mode === "aurora" ? "true" : "false";
  luckyMeal.dataset.active = mode === "lucky" ? "true" : "false";
}

function stopSoundBed() {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  if (rhythmTimer) {
    clearInterval(rhythmTimer);
    rhythmTimer = null;
  }
  for (const node of ambientNodes) {
    node.gain.gain.cancelScheduledValues(now);
    node.gain.gain.linearRampToValueAtTime(0.0001, now + 0.35);
    node.oscillator.stop(now + 0.45);
  }
  audioContext.close();
  audioContext = null;
  ambientNodes = [];
  soundBed.dataset.on = "false";
  soundBed.setAttribute("aria-pressed", "false");
  soundBed.textContent = "Calm audio";
  lockMusic.dataset.active = "false";
  luckyMeal.dataset.active = "false";
}

function startSoftRhythm(destination) {
  let step = 0;
  rhythmTimer = setInterval(() => {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    oscillator.type = "sine";
    oscillator.frequency.value = step % 4 === 0 ? 72 : 108;
    filter.type = "lowpass";
    filter.frequency.value = 220;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(step % 4 === 0 ? 0.1 : 0.036, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
    step += 1;
  }, 640);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed with ${response.status}`);
  return data;
}

function setBusy(button, text) {
  button.disabled = true;
  button.dataset.originalText = button.textContent;
  button.textContent = text;
}

function clearBusy(button, text) {
  button.disabled = false;
  button.textContent = text || button.dataset.originalText || button.textContent;
}

function languageToLocale(language) {
  return {
    English: "en-US",
    Spanish: "es-US",
    French: "fr-FR",
    Portuguese: "pt-BR",
    Arabic: "ar"
  }[language] || "en-US";
}

function formatPhone(value) {
  return value.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "+1 ($1) $2-$3");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
