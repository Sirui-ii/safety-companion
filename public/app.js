const metricEls = {
  luluStarts: document.querySelector("#luluStarts"),
  callClicks: document.querySelector("#callClicks"),
  checkIns: document.querySelector("#checkIns")
};

const markCheckIn = document.querySelector("#markCheckIn");
const callLinks = document.querySelectorAll("[data-track-call]");

initLanding();

async function initLanding() {
  renderMetrics(await getMetrics());

  callLinks.forEach((link) => {
    link.addEventListener("click", () => {
      sendMetric("/api/metrics/call");
    });
  });

  markCheckIn?.addEventListener("click", async () => {
    markCheckIn.disabled = true;
    markCheckIn.textContent = "Counted";
    renderMetrics(await postMetric("/api/metrics/check-in"));
    setTimeout(() => {
      markCheckIn.disabled = false;
      markCheckIn.textContent = "I checked in with Lulu";
    }, 1600);
  });
}

async function getMetrics() {
  try {
    const response = await fetch("/api/metrics");
    if (!response.ok) throw new Error("Metrics unavailable");
    return response.json();
  } catch {
    return { luluStarts: 0, callClicks: 0, checkIns: 0 };
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

function renderMetrics(metrics) {
  setMetric(metricEls.luluStarts, metrics.luluStarts);
  setMetric(metricEls.callClicks, metrics.callClicks);
  setMetric(metricEls.checkIns, metrics.checkIns);
}

function setMetric(element, value) {
  if (!element) return;
  element.textContent = new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function getCurrentMetrics() {
  return {
    luluStarts: metricNumber(metricEls.luluStarts),
    callClicks: metricNumber(metricEls.callClicks),
    checkIns: metricNumber(metricEls.checkIns)
  };
}

function metricNumber(element) {
  return Number((element?.textContent || "0").replace(/[^\d]/g, "")) || 0;
}
