/**
 * TrendTok Analytics - User-Centric Creator & SMM Dashboard Application
 * Light-theme modern SaaS interface with slide-over simulation sandbox.
 * Implements REQ-FR-08 (Web Dashboard) and REQ-FR-09 (Simulation Controller)
 */

let allTrendsData = [];
let activeFilter = "all";
let searchQuery = "";

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
  setupEventListeners();

  // Background telemetry refresher (every 6 seconds)
  setInterval(loadTelemetryOnly, 6000);
});

/**
 * Attaches user interaction and sandbox event listeners.
 */
function setupEventListeners() {
  // Sandbox Drawer Toggle
  const sandboxToggle = document.getElementById("btn-sandbox-toggle");
  const sandboxClose = document.getElementById("btn-close-sandbox");
  const drawerBackdrop = document.getElementById("drawer-backdrop");
  const drawer = document.getElementById("sandbox-drawer");

  function openDrawer() {
    drawer?.classList.add("open");
    drawerBackdrop?.classList.remove("hidden");
  }

  function closeDrawer() {
    drawer?.classList.remove("open");
    drawerBackdrop?.classList.add("hidden");
  }

  sandboxToggle?.addEventListener("click", openDrawer);
  sandboxClose?.addEventListener("click", closeDrawer);
  drawerBackdrop?.addEventListener("click", closeDrawer);

  // Simulation Actions
  document.getElementById("btn-seed")?.addEventListener("click", handleSeed);
  document.getElementById("btn-quick-seed")?.addEventListener("click", handleSeed);
  document.getElementById("btn-step")?.addEventListener("click", handleStep);
  document.getElementById("btn-viral")?.addEventListener("click", handleInjectViral);
  document.getElementById("btn-noise")?.addEventListener("click", handleInjectNoise);
  document.getElementById("btn-refresh")?.addEventListener("click", () => {
    loadDashboard();
    showToast("Telemetry stream refreshed.");
  });

  // Copy Featured Track Button
  document.getElementById("btn-copy-featured")?.addEventListener("click", () => {
    const soundId = document.getElementById("featured-id")?.textContent || "sound_aurora";
    navigator.clipboard?.writeText(soundId);
    showToast(`Copied ${soundId} to clipboard!`);
  });

  // Filter Chips
  const filterChips = document.querySelectorAll(".filter-chip");
  filterChips.forEach(chip => {
    chip.addEventListener("click", () => {
      filterChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeFilter = chip.dataset.filter;
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
 * Main dashboard data synchronizer.
 */
export async function loadDashboard() {
  try {
    await Promise.all([loadTelemetry(), loadTrendsData()]);
  } catch (err) {
    console.error("[TrendTok] Error loading data:", err);
  }
}

/**
 * Lightweight background telemetry refresher.
 */
async function loadTelemetryOnly() {
  try {
    await loadTelemetry();
  } catch (e) {
    // suppress poll error
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

  if (statusEl) statusEl.textContent = data.status === "ok" ? "Live Stream Active" : "Degraded";
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

  // Also query emerging list to guarantee exact alignment
  const emergingRes = await fetch("/api/trends/emerging");
  const emergingData = emergingRes.ok ? await emergingRes.json() : [];
  const emergingIds = new Set(emergingData.map(item => item.id));

  // Merge emerging flag
  allTrendsData.forEach(item => {
    item.isEmerging = emergingIds.has(item.id);
  });

  updateKpis(allTrendsData, emergingData);
  updateSpotlight(allTrendsData);
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
 * Updates the Spotlight Card with the highest ranking emerging audio.
 */
function updateSpotlight(allTrends) {
  const featured = allTrends.find(item => item.type === "sound" && item.isEmerging) || allTrends[0];
  if (!featured) return;

  const titleEl = document.getElementById("featured-title");
  const idEl = document.getElementById("featured-id");
  const vvsEl = document.getElementById("featured-vvs");
  const velEl = document.getElementById("featured-velocity");

  if (titleEl) titleEl.textContent = featured.title || featured.id;
  if (idEl) idEl.textContent = featured.id;
  if (vvsEl) vvsEl.textContent = `${featured.vvs.toFixed(1)} / 100`;
  if (velEl) velEl.textContent = `+${featured.hourlyVelocity ?? 0} v/hr`;
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
        <td colspan="9" class="table-loading">
          No trends matched your filter or search criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((item, index) => {
    const rank = index + 1;
    const rankClass = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : rank === 3 ? "rank-3" : "";
    const typeIcon = item.type === "sound" ? "🎵" : "#️⃣";
    const status = item.status || "NOISE";
    const vvs = (item.vvs || 0).toFixed(1);
    const hourlyVelocity = item.hourlyVelocity ?? (item.snapshotsCount > 1 ? "—" : "0");
    const accel = item.acceleration !== undefined ? `${item.acceleration > 0 ? "+" : ""}${Number(item.acceleration).toFixed(1)}` : "—";
    const sparkline = renderSparklineSvg(item.historyDeltas || [0, Math.round(item.vvs)]);

    return `
      <tr data-id="${escapeHtml(item.id)}">
        <td class="rank-cell ${rankClass}">#${rank}</td>
        <td>
          <span class="badge-mini">${typeIcon} ${escapeHtml(item.type)}</span>
        </td>
        <td>
          <div style="display: flex; flex-direction: column;">
            <span style="font-weight: 700; color: var(--text-primary);">${escapeHtml(item.title || item.id)}</span>
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-muted);">${escapeHtml(item.id)}</span>
          </div>
        </td>
        <td>
          <div class="vvs-wrapper">
            <span class="vvs-num">${vvs}</span>
            <div class="vvs-track">
              <div class="vvs-bar" style="width: ${Math.min(100, Math.max(0, item.vvs))}%"></div>
            </div>
          </div>
        </td>
        <td style="font-family: 'JetBrains Mono', monospace; font-weight: 600;">
          +${hourlyVelocity} <span style="font-size: 11px; color: var(--text-muted);">v/hr</span>
        </td>
        <td style="font-family: 'JetBrains Mono', monospace; font-weight: 600; color: ${item.acceleration > 0 ? "#059669" : "var(--text-muted)"};">
          ${accel}
        </td>
        <td>
          <span class="status-pill status-${status}">${escapeHtml(status)}</span>
        </td>
        <td>
          ${sparkline}
        </td>
        <td style="text-align: right;">
          ${item.type === "sound" ? `
            <button class="btn btn-outline-sm btn-inspect" data-sound-id="${escapeHtml(item.id)}">
              View Hashtags
            </button>
          ` : `
            <button class="btn btn-outline-sm btn-copy-tag" data-tag-title="${escapeHtml(item.title || item.id)}">
              Copy Tag
            </button>
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

  // Attach copy tag handlers
  document.querySelectorAll(".btn-copy-tag").forEach(btn => {
    btn.addEventListener("click", () => {
      const tag = btn.dataset.tagTitle;
      navigator.clipboard?.writeText(tag);
      showToast(`Copied ${tag} to clipboard!`);
    });
  });
}

/**
 * Generates lightweight, crisp SVG sparkline for trend trajectory.
 */
function renderSparklineSvg(deltas) {
  if (!deltas || deltas.length < 2) {
    return `<span style="color: var(--text-muted); font-size: 11px;">(Accumulating...)</span>`;
  }

  const width = 110;
  const height = 26;
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
      <polyline class="sparkline-line" points="${points}" />
    </svg>
  `;
}

/**
 * Inspects co-occurring hashtags for an audio sound track.
 */
async function inspectCorrelations(soundId) {
  const panel = document.getElementById("correlations-content");
  if (!panel) return;

  panel.innerHTML = `<div class="spinner"></div> Retrieving co-occurring tags for <code>${escapeHtml(soundId)}</code>...`;

  try {
    const res = await fetch(`/api/trends/${encodeURIComponent(soundId)}/correlations`);
    if (!res.ok) throw new Error("Could not retrieve correlation telemetry");
    const data = await res.json();

    if (!data.correlatedHashtags || data.correlatedHashtags.length === 0) {
      panel.innerHTML = `
        <div class="empty-placeholder">
          <p>No associated viral hashtags found for track <strong>${escapeHtml(soundId)}</strong>.</p>
        </div>
      `;
      return;
    }

    panel.innerHTML = `
      <div class="correlation-cluster">
        <div>
          <span style="font-weight: 700; font-size: 13px;">High-Affinity Hashtags for <code>${escapeHtml(soundId)}</code>:</span>
          <p style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">Pair these tags with this audio in your TikTok caption for higher FYP algorithm distribution.</p>
        </div>
        <div class="tag-list">
          ${data.correlatedHashtags.map(tag => `
            <span class="tag-item" title="Click to copy tag">${escapeHtml(tag)}</span>
          `).join("")}
        </div>
        <button id="btn-copy-all-tags" class="btn btn-outline-sm" style="margin-top: 10px; align-self: flex-start;">
          📋 Copy All ${data.correlatedHashtags.length} Tags to Clipboard
        </button>
      </div>
    `;

    // Click to copy individual tag
    panel.querySelectorAll(".tag-item").forEach(item => {
      item.addEventListener("click", () => {
        navigator.clipboard?.writeText(item.textContent);
        showToast(`Copied ${item.textContent}!`);
      });
    });

    // Copy all tags
    document.getElementById("btn-copy-all-tags")?.addEventListener("click", () => {
      const allStr = data.correlatedHashtags.join(" ");
      navigator.clipboard?.writeText(allStr);
      showToast("Copied all tags to clipboard!");
    });

  } catch (err) {
    panel.innerHTML = `<div class="empty-placeholder" style="color: var(--accent-magenta);">${err.message}</div>`;
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
      showToast("Canonical Golden Set loaded (5 sounds, 5 hashtags).");
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
      showToast("Simulation advanced by +1 hour.");
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
    showToast("Explosive viral sound injected! Status: VIRAL (VVS ≥ 80).");
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
    showToast("Sub-threshold noise injected! Status: NOISE (Suppressed).");
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
      alertEl.textContent = `Snapshot ingested successfully! Records queued: ${data.ingestedCount}`;
      alertEl.className = "alert-box success";
      await loadDashboard();
      showToast("New snapshot evaluated in VVS calculus.");
    } else {
      alertEl.textContent = `Validation error: ${data.message || data.error}`;
      alertEl.className = "alert-box error";
    }
  } catch (err) {
    alertEl.textContent = `Network communication error: ${err.message}`;
    alertEl.className = "alert-box error";
  }
}

/**
 * Shows temporary toast notification.
 */
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
