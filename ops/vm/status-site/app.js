const summaryEl = document.getElementById("summary");
const historyEl = document.getElementById("history");
const logEl = document.getElementById("log");
const refreshButton = document.getElementById("refresh");

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
}

refreshButton.addEventListener("click", () => {
  load().catch((error) => {
    logEl.textContent = `Failed to load status: ${error.message}`;
  });
});

load().catch((error) => {
  logEl.textContent = `Failed to load status: ${error.message}`;
});
