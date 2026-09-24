/**
 * TrendTok Analytics — Test & Simulation Lab Client Script
 * Exclusively communicates with /api/test/* endpoints and operates on data/trendtok_test.db
 */

let testTrendsData = [];
let activeFilter = "all";
let searchQuery = "";
let currentPage = 1;
let pageSize = 25;
let totalTrendsCount = 0;
let totalPages = 1;
let currentSortBy = "vvs";
let currentSortOrder = "desc";

document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  loadTestLab();

  // Background refresh every 10s
  setInterval(loadTelemetryOnly, 10000);
});

function setupEventListeners() {
  // Simulation Actions
  document.getElementById("btn-test-seed")?.addEventListener("click", handleSeed);
  document.getElementById("btn-test-step")?.addEventListener("click", handleStep);
  document.getElementById("btn-test-viral")?.addEventListener("click", handleInjectViral);
  document.getElementById("btn-test-noise")?.addEventListener("click", handleInjectNoise);
  document.getElementById("btn-test-reset")?.addEventListener("click", handleReset);
  document.getElementById("btn-test-refresh")?.addEventListener("click", () => {
    loadTestLab();
    showToast("Test metrics refreshed.");
  });

  // Bulk Ingestion
  document.getElementById("btn-test-ingest-500")?.addEventListener("click", () => handleBulkIngest(500));
  document.getElementById("btn-test-ingest-1000")?.addEventListener("click", () => handleBulkIngest(1000));
  document.getElementById("btn-test-ingest-2500")?.addEventListener("click", () => handleBulkIngest(2500));

  // Manual Ingestion Form
  document.getElementById("test-ingest-form")?.addEventListener("submit", handleManualIngest);

  // Category Filter Chips
  const filterChips = document.querySelectorAll(".filter-chip");
  filterChips.forEach(chip => {
    chip.addEventListener("click", () => {
      filterChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeFilter = chip.dataset.filter;
      currentPage = 1;
      loadTestTrends();
    });
  });

  // Sortable Headers
  document.querySelectorAll(".leaderboard-table th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.sort;
      if (currentSortBy === col) {
        currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
      } else {
        currentSortBy = col;
        currentSortOrder = (col === "rank" || col === "type" || col === "title" || col === "status") ? "asc" : "desc";
      }
      updateSortHeaderUi();
      loadTestTrends();
    });
  });

  // Search Input
  const searchInp = document.getElementById("test-search-input");
  let searchDebounce = null;
  searchInp?.addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchQuery = e.target.value.toLowerCase().trim();
      currentPage = 1;
      loadTestTrends();
    }, 250);
  });

  // Page Size Buttons
  document.querySelectorAll(".page-size-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      pageSize = Number(btn.dataset.size) || 25;
      currentPage = 1;
      loadTestTrends();
    });
  });

  // Pagination Prev / Next
  document.getElementById("btn-test-prev-page")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      loadTestTrends();
    }
  });

  document.getElementById("btn-test-next-page")?.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      loadTestTrends();
    }
  });

  // Modal Close
  const modal = document.getElementById("test-detail-modal");
  document.getElementById("btn-close-modal")?.addEventListener("click", () => {
    modal?.classList.add("hidden");
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
}

function updateSortHeaderUi() {
  document.querySelectorAll(".leaderboard-table th.sortable").forEach(th => {
    const col = th.dataset.sort;
    const icon = th.querySelector(".sort-icon");
    if (col === currentSortBy) {
      th.classList.add("active-sort");
      if (icon) icon.textContent = currentSortOrder === "asc" ? "↑" : "↓";
    } else {
      th.classList.remove("active-sort");
      if (icon) icon.textContent = "↕";
    }
  });
}

async function loadTestLab() {
  try {
    await Promise.all([loadTelemetryOnly(), loadTestTrends()]);
  } catch (err) {
    console.error("[TestLab] Load error:", err);
  }
}

async function loadTelemetryOnly() {
  try {
    const res = await fetch("/api/test/health");
    if (!res.ok) return;
    const data = await res.json();
    const trendsEl = document.getElementById("test-kpi-trends");
    const snapEl = document.getElementById("test-kpi-snapshots");
    if (trendsEl) trendsEl.textContent = (data.trackedItems ?? 0).toLocaleString();
    if (snapEl) snapEl.textContent = (data.databaseSnapshots ?? 0).toLocaleString();
  } catch (e) {}
}

async function loadTestTrends() {
  const pagedUrl = `/api/test/trends?limit=${pageSize}&page=${currentPage}&category=${activeFilter}&search=${encodeURIComponent(searchQuery)}&sortBy=${encodeURIComponent(currentSortBy)}&sortOrder=${encodeURIComponent(currentSortOrder)}`;
  const res = await fetch(pagedUrl);
  if (!res.ok) throw new Error(`Failed to load test trends: ${res.status}`);
  const data = await res.json();

  if (Array.isArray(data)) {
    testTrendsData = data;
    totalTrendsCount = data.length;
    totalPages = Math.max(1, Math.ceil(totalTrendsCount / pageSize));
  } else {
    testTrendsData = data.items || [];
    totalTrendsCount = data.totalCount ?? testTrendsData.length;
    totalPages = Math.max(1, data.totalPages ?? 1);
    currentPage = data.page ?? 1;
  }

  // Update counts
  let emergingCount = 0;
  let noiseCount = 0;
  testTrendsData.forEach(item => {
    if (item.status === "EMERGING") emergingCount++;
    if (item.status === "NOISE") noiseCount++;
  });
  const emEl = document.getElementById("test-kpi-emerging");
  const noEl = document.getElementById("test-kpi-noise");
  if (emEl) emEl.textContent = emergingCount;
  if (noEl) noEl.textContent = noiseCount;

  updatePaginationUi();
  renderTestTable();
}

function updatePaginationUi() {
  const startEl = document.getElementById("test-page-start");
  const endEl = document.getElementById("test-page-end");
  const totalEl = document.getElementById("test-total-count");
  const currEl = document.getElementById("test-current-page");
  const totPagesEl = document.getElementById("test-total-pages");
  const prevBtn = document.getElementById("btn-test-prev-page");
  const nextBtn = document.getElementById("btn-test-next-page");

  const start = totalTrendsCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalTrendsCount);

  if (startEl) startEl.textContent = start.toLocaleString();
  if (endEl) endEl.textContent = end.toLocaleString();
  if (totalEl) totalEl.textContent = totalTrendsCount.toLocaleString();
  if (currEl) currEl.textContent = currentPage;
  if (totPagesEl) totPagesEl.textContent = totalPages;

  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

  document.querySelectorAll(".page-size-btn").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.size) === pageSize);
  });
}

function renderTestTable() {
  const tbody = document.getElementById("test-leaderboard-body");
  if (!tbody) return;

  if (!testTrendsData || testTrendsData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="table-loading">
          No test records in <code>trendtok_test.db</code> matching <strong>"${escapeHtml(activeFilter)}"</strong>.
          Click <strong>Load Golden Set</strong> or submit a snapshot above.
        </td>
      </tr>
    `;
    return;
  }

  const offset = (currentPage - 1) * pageSize;
  const rows = testTrendsData.map((item, idx) => {
    const rank = offset + idx + 1;
    const isSound = item.type === "sound";
    const typeBadge = isSound ? "badge-type-sound" : "badge-type-hashtag";
    const typeLabel = isSound ? "Sound" : "Tag";
    const statusClass = getStatusClass(item.status);

    const safeUrl = item.tiktokUrl || `https://www.tiktok.com/search?q=${encodeURIComponent(item.title || item.id)}`;

    return `
      <tr>
        <td class="col-rank">
          <span class="rank-num">${rank}</span>
        </td>
        <td class="col-type">
          <span class="${typeBadge}">${typeLabel}</span>
        </td>
        <td class="col-name">
          <div class="trend-title-cell">
            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="trend-tiktok-link" title="Open search on TikTok">
              ${escapeHtml(item.title || item.id)}
              <span class="external-link-icon">↗</span>
            </a>
            <div class="trend-id-sub">${escapeHtml(item.id)}</div>
          </div>
        </td>
        <td class="col-metric">
          <span class="vvs-score ${item.vvs >= 60 ? 'vvs-high' : ''}">${Number(item.vvs || 0).toFixed(1)}</span>
        </td>
        <td class="col-metric">
          <span class="velocity-pill">+${item.hourlyVelocity ?? 0}</span>
        </td>
        <td class="col-metric">
          <span class="stat-num">${Number(item.acceleration ?? 0) >= 0 ? '+' : ''}${Number(item.acceleration ?? 0).toFixed(1)}</span>
        </td>
        <td class="col-status">
          <span class="${statusClass}">${item.status || "NOISE"}</span>
        </td>
        <td class="col-actions">
          <button class="btn btn-outline-sm btn-inspect-test" data-id="${escapeHtml(item.id)}">
            Inspect
          </button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = rows;

  // Attach inspect listeners
  tbody.querySelectorAll(".btn-inspect-test").forEach(btn => {
    btn.addEventListener("click", () => inspectTrend(btn.dataset.id));
  });
}

async function inspectTrend(trendId) {
  try {
    const res = await fetch(`/api/test/trends/${encodeURIComponent(trendId)}/detail`);
    if (!res.ok) {
      showToast(`Could not load details for ${trendId}`);
      return;
    }
    const d = await res.json();
    const modal = document.getElementById("test-detail-modal");

    document.getElementById("modal-type").textContent = d.type === "sound" ? "Sound / Audio" : "Hashtag";
    document.getElementById("modal-title").textContent = d.title || d.id;
    document.getElementById("modal-id").textContent = d.id;
    document.getElementById("modal-views").textContent = Number(d.totalViews || 0).toLocaleString();
    document.getElementById("modal-videos").textContent = Number(d.totalVideos || 0).toLocaleString();
    document.getElementById("modal-velocity").textContent = `+${d.hourlyVelocity ?? 0} v/hr`;
    document.getElementById("modal-vvs").textContent = Number(d.vvs ?? 0).toFixed(1);

    const link = document.getElementById("modal-tiktok-link");
    if (link) link.href = d.tiktokUrl || `https://www.tiktok.com/search?q=${encodeURIComponent(d.title || d.id)}`;

    // Render snapshots table
    const snapBody = document.getElementById("modal-snapshots-body");
    if (snapBody) {
      const sn = d.snapshots || [];
      if (sn.length === 0) {
        snapBody.innerHTML = `<tr><td colspan="4">No historical records in test database.</td></tr>`;
      } else {
        snapBody.innerHTML = sn.map((s, idx) => {
          const prev = idx > 0 ? sn[idx - 1] : s;
          const delta = Math.max(0, s.totalVideos - prev.totalVideos);
          return `
            <tr>
              <td>${new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
              <td>${Number(s.totalViews).toLocaleString()}</td>
              <td>${Number(s.totalVideos).toLocaleString()}</td>
              <td class="highlight-green">+${delta}</td>
            </tr>
          `;
        }).join("");
      }
    }

    modal?.classList.remove("hidden");
  } catch (err) {
    showToast(`Inspection error: ${err.message}`);
  }
}

async function handleSeed() {
  const btn = document.getElementById("btn-test-seed");
  if (btn) btn.disabled = true;
  try {
    const res = await fetch("/api/test/simulation/seed", { method: "POST" });
    if (res.ok) {
      currentPage = 1;
      await loadTestLab();
      showToast("Golden Set loaded into trendtok_test.db");
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleStep() {
  const btn = document.getElementById("btn-test-step");
  if (btn) btn.disabled = true;
  try {
    const res = await fetch("/api/test/simulation/step", { method: "POST" });
    if (res.ok) {
      await loadTestLab();
      showToast("Test simulation stepped +1 hour.");
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleInjectViral() {
  try {
    await fetch("/api/test/simulation/inject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: "viral_spike",
        itemId: `sound_viral_${Date.now().toString().slice(-4)}`,
        type: "sound",
        title: "Test Hyper Sonic Pulse"
      })
    });
    currentPage = 1;
    await loadTestLab();
    showToast("Viral spike injected into test database!");
  } catch (err) {
    console.error(err);
  }
}

async function handleInjectNoise() {
  try {
    await fetch("/api/test/simulation/inject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: "noise_spike",
        itemId: `hash_noise_${Date.now().toString().slice(-4)}`,
        type: "hashtag",
        title: "#microtestnoise"
      })
    });
    currentPage = 1;
    await loadTestLab();
    showToast("Noise anomaly injected into test database!");
  } catch (err) {
    console.error(err);
  }
}

async function handleReset() {
  if (!confirm("Are you sure you want to wipe all records in data/trendtok_test.db?")) return;
  try {
    await fetch("/api/test/simulation/reset", { method: "POST" });
    currentPage = 1;
    await loadTestLab();
    showToast("Test database cleared.");
  } catch (err) {
    console.error(err);
  }
}

async function handleBulkIngest(scale) {
  showToast(`Ingesting ${scale} trends into test database...`);
  try {
    const res = await fetch(`/api/test/ingest/fetch?scale=${scale}`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      currentPage = 1;
      await loadTestLab();
      showToast(`Ingested ${data.ingestedCount} test items into trendtok_test.db`);
    } else {
      showToast(`Error: ${data.message || data.error}`);
    }
  } catch (err) {
    showToast(`Network error: ${err.message}`);
  }
}

async function handleManualIngest(e) {
  e.preventDefault();
  const alertEl = document.getElementById("test-ingest-alert");
  if (!alertEl) return;

  const payload = {
    itemId: document.getElementById("inp-id").value.trim(),
    type: document.getElementById("inp-type").value,
    title: document.getElementById("inp-title").value.trim(),
    totalViews: Number(document.getElementById("inp-views").value),
    totalVideos: Number(document.getElementById("inp-videos").value),
    timestamp: new Date().toISOString()
  };

  try {
    const res = await fetch("/api/test/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      alertEl.textContent = `Snapshot ingested into trendtok_test.db! Records queued: ${data.ingestedCount}`;
      alertEl.className = "alert-box success";
      alertEl.classList.remove("hidden");
      await loadTestLab();
      showToast("Test snapshot recorded.");
    } else {
      alertEl.textContent = `Validation error: ${data.message || data.error}`;
      alertEl.className = "alert-box error";
      alertEl.classList.remove("hidden");
    }
  } catch (err) {
    alertEl.textContent = `Network communication error: ${err.message}`;
    alertEl.className = "alert-box error";
    alertEl.classList.remove("hidden");
  }
}

function getStatusClass(status) {
  switch (status) {
    case "VIRAL": return "badge-status-viral";
    case "EMERGING": return "badge-status-emerging";
    case "SATURATED": return "badge-status-saturated";
    case "DECAYING": return "badge-status-decaying";
    case "NOISE":
    default:
      return "badge-status-noise";
  }
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => {
    toast.classList.add("hidden");
  }, 2800);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
