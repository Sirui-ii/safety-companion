const metricEls = {
  luluStarts: document.querySelector("#luluStarts"),
  activeNow: document.querySelector("#activeNow")
};

const LULU_SESSION_KEY = "lulu_session_id";
const LULU_LEAD_KEY = "lulu_lead_submitted";
const LULU_PHONE_HREF = "tel:+14159085000";
const LULU_PHONE_LABEL = "+1 (415) 908-5000";
const callLinks = document.querySelectorAll("[data-track-call]");
const contactLinks = document.querySelectorAll("[data-track-contact]");
const companionCard = document.querySelector(".companion-card");
const leadForm = document.querySelector("#lead-form");
const gatedActions = document.querySelector("[data-gated-actions]");
const phoneLabel = document.querySelector("[data-phone-label]");
const rootStyle = document.documentElement.style;

initLanding();
initAmbientMotion();

async function initLanding() {
  renderMetrics(await getMetrics());
  await postActiveMetric();
  window.setInterval(postActiveMetric, 30_000);
  if (sessionStorage.getItem(LULU_LEAD_KEY) === "true") unlockLuuluActions();

  callLinks.forEach((link) => {
    link.addEventListener("click", () => {
      sendMetric("/api/metrics/call");
    });
  });

  contactLinks.forEach((link) => {
    link.addEventListener("click", () => {
      sendMetric("/api/metrics/contact");
    });
  });

  leadForm?.addEventListener("submit", handleLeadSubmit);
}

async function getMetrics() {
  try {
    const response = await fetch("/api/metrics");
    if (!response.ok) throw new Error("Metrics unavailable");
    return response.json();
  } catch {
    return { luluStarts: 0, livekitCalls: 0, callClicks: 0, contactSaves: 0, activeNow: 0 };
  }
}

async function postMetric(path) {
  try {
    const response = await fetch(path, { method: "POST", keepalive: true });
    if (!response.ok) throw new Error("Metrics unavailable");
    return response.json();
  } catch {
    return getCurrentMetrics();
  }
}

function sendMetric(path) {
  if (navigator.sendBeacon) {
    navigator.sendBeacon(path, new Blob([], { type: "application/json" }));
    return;
  }
  fetch(path, { method: "POST", keepalive: true }).catch(() => {});
}

async function handleLeadSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".lead-status");
  const button = form.querySelector("button[type='submit']");
  const formData = new FormData(form);
  const payload = {
    firstName: String(formData.get("firstName") || ""),
    lastName: String(formData.get("lastName") || ""),
    phone: String(formData.get("phone") || ""),
    email: String(formData.get("email") || ""),
    smsOptIn: formData.get("smsOptIn") === "on",
    emailOptIn: formData.get("emailOptIn") === "on",
    sessionId: getSessionId()
  };

  setLeadStatus(status, "Saving...");
  if (button) button.disabled = true;
  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not save your details.");
    sessionStorage.setItem(LULU_LEAD_KEY, "true");
    unlockLuuluActions();
    setLeadStatus(status, "You're in. Luulu's number is ready.");
    renderMetrics(data.metrics || getCurrentMetrics());
  } catch (error) {
    setLeadStatus(status, error.message || "Could not save your details. Please try again.");
  } finally {
    if (button) button.disabled = false;
  }
}

function unlockLuuluActions() {
  if (phoneLabel) phoneLabel.textContent = LULU_PHONE_LABEL;
  callLinks.forEach((link) => link.setAttribute("href", LULU_PHONE_HREF));
  if (gatedActions) gatedActions.hidden = false;
  leadForm?.classList.add("is-complete");
}

function setLeadStatus(element, message) {
  if (!element) return;
  element.textContent = message;
}

async function postActiveMetric() {
  try {
    const response = await fetch("/api/metrics/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ sessionId: getSessionId() })
    });
    if (!response.ok) throw new Error("Metrics unavailable");
    renderMetrics(await response.json());
  } catch {
    renderMetrics(getCurrentMetrics());
  }
}

function renderMetrics(metrics) {
  setMetric(metricEls.luluStarts, metrics.livekitCalls || metrics.luluStarts || metrics.callClicks);
  setMetric(metricEls.activeNow, metrics.activeNow);
}

function setMetric(element, value) {
  if (!element) return;
  element.textContent = new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function getCurrentMetrics() {
  return {
    luluStarts: metricNumber(metricEls.luluStarts),
    activeNow: metricNumber(metricEls.activeNow)
  };
}

function metricNumber(element) {
  return Number((element?.textContent || "0").replace(/[^\d]/g, "")) || 0;
}

function getSessionId() {
  let sessionId = sessionStorage.getItem(LULU_SESSION_KEY);
  if (!sessionId) {
    sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(LULU_SESSION_KEY, sessionId);
  }
  return sessionId;
}

function initAmbientMotion() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  let ticking = false;
  const updateScroll = () => {
    const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const progress = Math.min(window.scrollY / maxScroll, 1);
    rootStyle.setProperty("--scroll-progress", progress.toFixed(4));
    ticking = false;
  };

  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateScroll);
  }, { passive: true });
  updateScroll();

  window.addEventListener("pointermove", (event) => {
    const x = event.clientX / window.innerWidth;
    const y = event.clientY / window.innerHeight;
    rootStyle.setProperty("--pointer-x", x.toFixed(4));
    rootStyle.setProperty("--pointer-y", y.toFixed(4));
  }, { passive: true });

  companionCard?.addEventListener("click", () => {
    companionCard.classList.remove("is-lit");
    requestAnimationFrame(() => companionCard.classList.add("is-lit"));
    window.setTimeout(() => companionCard.classList.remove("is-lit"), 820);
  });
}
