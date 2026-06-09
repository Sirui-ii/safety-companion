const metricEls = {
  luluStarts: document.querySelector("#luluStarts")
};

const callLinks = document.querySelectorAll("[data-track-call]");

initLanding();

async function initLanding() {
  renderMetrics(await getMetrics());

  callLinks.forEach((link) => {
    link.addEventListener("click", () => {
      sendMetric("/api/metrics/call");
    });
  });

}

async function getMetrics() {
  try {
    const response = await fetch("/api/metrics");
    if (!response.ok) throw new Error("Metrics unavailable");
    return response.json();
  } catch {
    return { luluStarts: 0, livekitCalls: 0, callClicks: 0 };
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
  setMetric(metricEls.luluStarts, metrics.livekitCalls || metrics.luluStarts || metrics.callClicks);
}

function setMetric(element, value) {
  if (!element) return;
  element.textContent = new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function getCurrentMetrics() {
  return {
    luluStarts: metricNumber(metricEls.luluStarts)
  };
}

function metricNumber(element) {
  return Number((element?.textContent || "0").replace(/[^\d]/g, "")) || 0;
}
