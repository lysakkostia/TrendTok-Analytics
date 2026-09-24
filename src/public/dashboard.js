/**
 * TrendTok Analytics - Client Web Dashboard Application
 * Implements REQ-FR-08 (Web Dashboard) and REQ-FR-09 (Simulation Controller)
 */

let allTrendsData = [];
let activeFilter = "all";
let searchQuery = "";

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
  setupEventListeners();

  // Auto-refresh telemetry every 5 seconds
  setInterval(loadTelemetryOnly, 5000);
});

/**
 * Sets up button and interaction listeners.
 */
function setupEventListeners() {
  document.getElementById("btn-seed")?.addEventListener("click", handleSeed);
  document.getElementById("btn-step")?.addEventListener("click", handleStep);
  document.getElementById("btn-viral")?.addEventListener("click", handleInjectViral);
  document.getElementById("btn-noise")?.addEventListener("click", handleInjectNoise);
  document.getElementById("btn-refresh")?.addEventListener("click", loadDashboard);

  // Filter tabs
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter;
      renderTable();
    });
  });

  // Search input
  const searchInp = document.getElementById("search-input");
  searchInp?.addEventListener("input", (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderTable();
  });

  // Manual Ingest form
  const ingestForm = document.getElementById("ingest-form");
  ingestForm?.addEventListener("submit", handleManualIngest);
}

/**
 * Main data loader for dashboard.
 */
export async function loadDashboard() {
  try {
    await Promise.all([loadTelemetry(), loadTrendsData()]);
  } catch (err) {
    console.error("[Dashboard] Error loading data:", err);
  }
}

/**
 * Lightweight telemetry refresher.
 */
async function loadTelemetryOnly() {
  try {
    await loadTelemetry();
  } catch (e) {
    // suppress background poll error
  }
}

/**
 * Fetches and displays service telemetry.
 */
async function loadTelemetry() {
  const res = await fetch("/api/health");
  if (!res.ok) return;
  const data = await res.json();

  const statusEl = document.getElementById("service-status");
  const uptimeEl = document.getElementById("uptime-val");
  const totalKpiEl = document.getElementById("kpi-total");

  if (statusEl) statusEl.textContent = data.status === "ok" ? "СИСТЕМА АКТИВНА" : "УВАГА";
  if (uptimeEl) {
    const sec = Math.floor(data.uptime || 0);
    uptimeEl.textContent = sec > 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`;
  }
  if (totalKpiEl) totalKpiEl.textContent = data.trackedItems ?? 0;
}

/**
 * Fetches full trends dataset with snapshots and lifecycle calculations.
 */
async function loadTrendsData() {
  const res = await fetch("/api/trends");
  if (!res.ok) {
    throw new Error(`Failed to load trends: ${res.status}`);
  }
  allTrendsData = await res.json();

  // Also fetch emerging list to guarantee exact alignment
  const emergingRes = await fetch("/api/trends/emerging");
  const emergingData = emergingRes.ok ? await emergingRes.json() : [];
  const emergingIds = new Set(emergingData.map(item => item.id));

  // Merge emerging flag
  allTrendsData.forEach(item => {
    item.isEmerging = emergingIds.has(item.id);
  });

  updateKpis(allTrendsData, emergingData);
  renderTable();
}

/**
 * Updates KPI Summary Cards based on dataset.
 */
function updateKpis(allTrends, emerging) {
  const total = allTrends.length;
  const emergingCount = emerging.length;

  let peakVvs = 0;
  let noiseCount = 0;
  let soundCount = 0;
  let hashCount = 0;

  allTrends.forEach(item => {
    if (item.vvs > peakVvs) peakVvs = item.vvs;
    if (item.status === "NOISE") noiseCount++;
    if (item.type === "sound") soundCount++;
    if (item.type === "hashtag") hashCount++;
  });

  const noiseRate = total > 0 ? Math.round((noiseCount / total) * 100) : 0;

  const kpiEmerging = document.getElementById("kpi-emerging");
  const kpiPeakVvs = document.getElementById("kpi-peak-vvs");
  const kpiNoiseRate = document.getElementById("kpi-noise-rate");

  const countAll = document.getElementById("count-all");
  const countEmerging = document.getElementById("count-emerging");
  const countSound = document.getElementById("count-sound");
  const countHashtag = document.getElementById("count-hashtag");

  if (kpiEmerging) kpiEmerging.textContent = emergingCount;
  if (kpiPeakVvs) kpiPeakVvs.textContent = peakVvs.toFixed(1);
  if (kpiNoiseRate) kpiNoiseRate.textContent = `${noiseRate}%`;

  if (countAll) countAll.textContent = total;
  if (countEmerging) countEmerging.textContent = emergingCount;
  if (countSound) countSound.textContent = soundCount;
  if (countHashtag) countHashtag.textContent = hashCount;
}

/**
 * Renders the filtered and searched leaderboard table.
 */
function renderTable() {
  const tbody = document.getElementById("leaderboard-body");
  if (!tbody) return;

  let filtered = allTrendsData.filter(item => {
    if (activeFilter === "emerging" && !item.isEmerging) return false;
    if (activeFilter === "sound" && item.type !== "sound") return false;
    if (activeFilter === "hashtag" && item.type !== "hashtag") return false;

    if (searchQuery) {
      const matchId = (item.id || "").toLowerCase().includes(searchQuery);
      const matchTitle = (item.title || "").toLowerCase().includes(searchQuery);
      return matchId || matchTitle;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="loading-state">
          Не знайдено жодного тренду за заданими критеріями фільтрації.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((item, index) => {
    const rank = index + 1;
    const rankClass = rank === 1 ? "top-1" : rank === 2 ? "top-2" : rank === 3 ? "top-3" : "";
    const typeIcon = item.type === "sound" ? "🎵" : "#️⃣";
    const statusClass = `status-${item.status || "NOISE"}`;
    const vvs = (item.vvs || 0).toFixed(1);
    const hourlyVelocity = item.hourlyVelocity ?? (item.snapshotsCount > 1 ? "—" : "0");
    const accel = item.acceleration !== undefined ? `${item.acceleration > 0 ? "+" : ""}${Number(item.acceleration).toFixed(1)}` : "—";
    const sparkline = renderSparklineSvg(item.historyDeltas || [0, Math.round(item.vvs)]);

    return `
      <tr data-id="${escapeHtml(item.id)}">
        <td class="trend-rank ${rankClass}">#${rank}</td>
        <td>
          <span class="entity-badge entity-${escapeHtml(item.type)}">${typeIcon} ${escapeHtml(item.type)}</span>
        </td>
        <td>
          <div class="trend-identity">
            <span class="trend-title">${escapeHtml(item.title || item.id)}</span>
            <span class="trend-id">${escapeHtml(item.id)}</span>
          </div>
        </td>
        <td>
          <div class="vvs-cell">
            <span class="vvs-score">${vvs}</span>
            <div class="vvs-bar-track">
              <div class="vvs-bar-fill" style="width: ${Math.min(100, Math.max(0, item.vvs))}%"></div>
            </div>
          </div>
        </td>
        <td style="font-family: 'JetBrains Mono', monospace; font-weight: 600;">
          ${hourlyVelocity} <span style="font-size: 11px; color: var(--text-muted);">в/год</span>
        </td>
        <td style="font-family: 'JetBrains Mono', monospace; color: ${item.acceleration > 0 ? "var(--accent-green)" : "var(--text-muted)};">
          ${accel}
        </td>
        <td>
          <span class="status-pill ${statusClass}">${escapeHtml(item.status || "NOISE")}</span>
        </td>
        <td>
          ${sparkline}
        </td>
        <td>
          ${item.type === "sound" ? `
            <button class="btn btn-secondary btn-inspect" data-sound-id="${escapeHtml(item.id)}" style="padding: 4px 8px; font-size: 11px;">
              🔗 Хештеги
            </button>
          ` : `
            <span style="color: var(--text-muted); font-size: 11px;">—</span>
          `}
        </td>
      </tr>
    `;
  }).join("");

  // Attach inspection handlers
  document.querySelectorAll(".btn-inspect").forEach(btn => {
    btn.addEventListener("click", () => {
      const soundId = btn.dataset.soundId;
      inspectCorrelations(soundId);
    });
  });
}

/**
 * Generates lightweight SVG sparkline.
 */
function renderSparklineSvg(deltas) {
  if (!deltas || deltas.length < 2) {
    return `<div style="color: var(--text-muted); font-size: 11px;">(мало даних)</div>`;
  }

  const width = 110;
  const height = 28;
  const max = Math.max(...deltas, 10);
  const min = Math.min(...deltas, 0);
  const range = max - min || 1;

  const points = deltas.map((val, i) => {
    const x = Math.round((i / (deltas.length - 1)) * (width - 4)) + 2;
    const y = Math.round(height - 4 - ((val - min) / range) * (height - 8)) + 2;
    return `${x},${y}`;
  }).join(" ");

  return `
    <svg class="sparkline-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <polyline class="sparkline-path" points="${points}" />
    </svg>
  `;
}

/**
 * Inspects co-occurring hashtags for a sound item.
 */
async function inspectCorrelations(soundId) {
  const panel = document.getElementById("correlations-content");
  if (!panel) return;

  panel.innerHTML = `<div class="spinner"></div> Запит кореляцій для <code>${escapeHtml(soundId)}</code>...`;

  try {
    const res = await fetch(`/api/trends/${encodeURIComponent(soundId)}/correlations`);
    if (!res.ok) throw new Error("Помилка отримання даних кореляції");
    const data = await res.json();

    if (!data.correlatedHashtags || data.correlatedHashtags.length === 0) {
      panel.innerHTML = `<p class="empty-state">Для звуку <strong>${escapeHtml(soundId)}</strong> немає зафіксованих асоційованих хештегів.</p>`;
      return;
    }

    panel.innerHTML = `
      <div>
        <div style="font-weight: 700; margin-bottom: 8px;">Асоційовані вірусні хештеги для <code>${escapeHtml(soundId)}</code>:</div>
        <div class="correlation-tags">
          ${data.correlatedHashtags.map(tag => `<span class="correlation-tag">${escapeHtml(tag)}</span>`).join("")}
        </div>
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `<p class="empty-state" style="color: var(--accent-rose);">${err.message}</p>`;
  }
}

/**
 * Handles simulation seed.
 */
async function handleSeed() {
  const btn = document.getElementById("btn-seed");
  if (btn) btn.disabled = true;
  try {
    const res = await fetch("/api/simulation/seed", { method: "POST" });
    if (res.ok) {
      await loadDashboard();
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Handles simulation step (+1 hour).
 */
async function handleStep() {
  const btn = document.getElementById("btn-step");
  if (btn) btn.disabled = true;
  try {
    const res = await fetch("/api/simulation/step", { method: "POST" });
    if (res.ok) {
      await loadDashboard();
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Injects viral spike.
 */
async function handleInjectViral() {
  try {
    await fetch("/api/simulation/inject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: "viral_spike",
        itemId: `sound_viral_${Date.now().toString().slice(-4)}`,
        type: "sound",
        title: "Neon Echo Velocity"
      })
    });
    await loadDashboard();
  } catch (err) {
    console.error(err);
  }
}

/**
 * Injects micro-sample noise.
 */
async function handleInjectNoise() {
  try {
    await fetch("/api/simulation/inject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: "noise_spike",
        itemId: `hash_noise_${Date.now().toString().slice(-4)}`,
        type: "hashtag",
        title: "#microanomaly"
      })
    });
    await loadDashboard();
  } catch (err) {
    console.error(err);
  }
}

/**
 * Handles manual snapshot form submit.
 */
async function handleManualIngest(e) {
  e.preventDefault();
  const alertEl = document.getElementById("ingest-alert");
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
    const res = await fetch("/api/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      alertEl.textContent = `✅ Зріз успішно додано! Зафіксовано записів: ${data.ingestedCount}`;
      alertEl.className = "ingest-alert success";
      await loadDashboard();
    } else {
      alertEl.textContent = `❌ Помилка: ${data.message || data.error}`;
      alertEl.className = "ingest-alert error";
    }
  } catch (err) {
    alertEl.textContent = `❌ Мережева помилка: ${err.message}`;
    alertEl.className = "ingest-alert error";
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
