const summaryEl = document.getElementById("summary");
const historyEl = document.getElementById("history");
const logEl = document.getElementById("log");
const refreshButton = document.getElementById("refresh");
const redeployButton = document.getElementById("redeploy");
const actionStatusEl = document.getElementById("action-status");
const REDEPLOY_PASSWORD_KEY = "somnia2-redeploy-password";
let pollTimer = null;

function formatValue(value) {
  return value || "n/a";
}

function formatCommit(commit, repoUrl) {
  if (!commit) return "n/a";
  const short = commit.slice(0, 7);
  const href = `${repoUrl.replace(/\.git$/, "")}/commit/${commit}`;
  return `<a href="${href}" target="_blank" rel="noreferrer">${short}</a>`;
}

function statusClass(status) {
  if (status === "success") return "success";
  if (status === "running") return "running";
  if (status === "failed") return "failed";
  return "idle";
}

function renderSummary(status) {
  const rows = [
    ["Status", `<span class="pill ${statusClass(status.status)}">${status.status}</span>`],
    ["Message", formatValue(status.message)],
    ["Branch", formatValue(status.branch)],
    ["Target Commit", formatCommit(status.targetCommit, status.repoUrl || "")],
    ["Deployed Commit", formatCommit(status.deployedCommit, status.repoUrl || "")],
    ["Started", formatValue(status.startedAt)],
    ["Finished", formatValue(status.finishedAt)],
    ["Duration", status.durationSec ? `${status.durationSec}s` : "n/a"],
    ["Release Path", formatValue(status.releasePath)],
    ["Updated", formatValue(status.updatedAt)],
  ];

  summaryEl.innerHTML = rows
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
    .join("");
}

function renderHistory(history) {
  const items = history?.history || [];
  if (!items.length) {
    historyEl.innerHTML = "<p>No deployments recorded yet.</p>";
    return;
  }

  historyEl.innerHTML = items
    .map((item) => {
      const commit = item.commitUrl
        ? `<a href="${item.commitUrl}" target="_blank" rel="noreferrer">${(item.commit || "").slice(0, 7)}</a>`
        : formatValue(item.commit);
      return `
        <article class="history-item">
          <div><span class="pill ${statusClass(item.status)}">${item.status}</span></div>
          <p><strong>${item.commitSubject || "No commit subject"}</strong></p>
          <p>${commit} by ${formatValue(item.commitAuthor)}</p>
          <p>${formatValue(item.finishedAt)} · ${item.durationSec || 0}s</p>
        </article>
      `;
    })
    .join("");
}

function setActionStatus(message) {
  actionStatusEl.textContent = message;
}

async function load() {
  const [statusRes, historyRes, logRes] = await Promise.all([
    fetch("/status/data/status.json", { cache: "no-store" }),
    fetch("/status/data/history.json", { cache: "no-store" }),
    fetch("/status/data/deploy.log", { cache: "no-store" }),
  ]);

  const status = await statusRes.json();
  const history = await historyRes.json();
  const log = await logRes.text();

  renderSummary(status);
  renderHistory(history);
  logEl.textContent = log || "No log output yet.";
  return status;
}

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  pollTimer = window.setInterval(async () => {
    try {
      const status = await load();
      if (status.status === "running") {
        setActionStatus("Redeploy in progress...");
        return;
      }

      if (status.status === "success") {
        setActionStatus("Redeploy completed.");
      } else if (status.status === "failed") {
        setActionStatus(`Redeploy failed: ${status.message || "unknown error"}`);
      }
      stopPolling();
    } catch (error) {
      setActionStatus(`Status refresh failed: ${error instanceof Error ? error.message : String(error)}`);
      stopPolling();
    }
  }, 2000);
}

refreshButton.addEventListener("click", () => {
  load().catch((error) => {
    logEl.textContent = `Failed to load status: ${error.message}`;
  });
});

redeployButton.addEventListener("click", async () => {
  const savedPassword = window.localStorage.getItem(REDEPLOY_PASSWORD_KEY) || "";
  const providedPassword = window.prompt("Redeploy password", savedPassword);
  if (!providedPassword) {
    return;
  }

  window.localStorage.setItem(REDEPLOY_PASSWORD_KEY, providedPassword);
  redeployButton.disabled = true;
  setActionStatus("Triggering redeploy...");

  try {
    const response = await fetch("/api/admin/redeploy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-redeploy-password": providedPassword,
      },
      body: JSON.stringify({ password: providedPassword }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
    }

    setActionStatus("Redeploy requested. Waiting for deploy status...");
    startPolling();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setActionStatus(`Redeploy failed: ${message}`);
  } finally {
    redeployButton.disabled = false;
  }
});

load().catch((error) => {
  logEl.textContent = `Failed to load status: ${error.message}`;
});
