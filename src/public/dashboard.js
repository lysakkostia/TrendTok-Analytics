/**
 * TrendTok Analytics - User-Centric Creator & SMM Dashboard Application
 * Light-theme modern SaaS interface with slide-over simulation sandbox.
 * Implements REQ-FR-08 (Dashboard), REQ-FR-12 (SQLite Detail), REQ-FR-14 (Deep-Links), and REQ-FR-15 (Pagination & Categories).
 */

let allTrendsData = [];
let activeFilter = "all";
let searchQuery = "";
let currentPage = 1;
let pageSize = 50;
let totalTrendsCount = 0;
let totalPages = 1;

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
  setupEventListeners();

  // Background telemetry refresher (every 8 seconds)
  setInterval(loadTelemetryOnly, 8000);
});

/**
 * Attaches user interaction, pagination, modal, and sandbox event listeners.
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

  // Ingestion & Simulation Actions
  document.getElementById("btn-ingest-1000")?.addEventListener("click", () => handleIngestScale(1000));
  document.getElementById("btn-ingest-2500")?.addEventListener("click", () => handleIngestScale(2500));
  document.getElementById("btn-fetch-live")?.addEventListener("click", handleFetchLive);
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

  // Category Metric Tabs (REQ-FR-15)
  const filterChips = document.querySelectorAll(".filter-chip");
  filterChips.forEach(chip => {
    chip.addEventListener("click", () => {
      filterChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeFilter = chip.dataset.filter;
      currentPage = 1;
      loadTrendsData();
    });
  });

  // Search input
  const searchInp = document.getElementById("search-input");
  let searchDebounce = null;
  searchInp?.addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchQuery = e.target.value.toLowerCase().trim();
      currentPage = 1;
      loadTrendsData();
    }, 250);
  });

  // Page Size Buttons (REQ-FR-15)
  document.querySelectorAll(".page-size-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      pageSize = Number(btn.dataset.size) || 50;
      currentPage = 1;
      loadTrendsData();
    });
  });

  // Prev / Next Pagination Controls (REQ-FR-15)
  document.getElementById("btn-prev-page")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      loadTrendsData();
    }
  });

  document.getElementById("btn-next-page")?.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      loadTrendsData();
    }
  });

  // Detail Modal Close Handlers (REQ-FR-12 & REQ-FR-15)
  const modal = document.getElementById("trend-detail-modal");
  const modalCloseBtn = document.getElementById("btn-close-modal");
  modalCloseBtn?.addEventListener("click", () => {
    modal?.classList.add("hidden");
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.add("hidden");
    }
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
  if (totalKpiEl) totalKpiEl.textContent = (data.trackedItems ?? 0).toLocaleString();
}

/**
 * Fetches trends dataset with pagination, categories, and SQLite queries (REQ-FR-15).
 */
async function loadTrendsData() {
  const pagedUrl = `/api/trends?limit=${pageSize}&page=${currentPage}&category=${activeFilter}&search=${encodeURIComponent(searchQuery)}`;
  const res = await fetch(pagedUrl);
  if (!res.ok) {
    throw new Error(`Failed to load trends: ${res.status}`);
  }
  const data = await res.json();

  if (Array.isArray(data)) {
    // Backward-compatible flat array
    allTrendsData = data;
    totalTrendsCount = data.length;
    totalPages = Math.max(1, Math.ceil(totalTrendsCount / pageSize));
  } else {
    // Structured pagination response (REQ-FR-15)
    allTrendsData = data.items || [];
    totalTrendsCount = data.totalCount ?? allTrendsData.length;
    totalPages = Math.max(1, data.totalPages ?? 1);
    currentPage = data.page ?? 1;
  }

  updatePaginationUi();
  updateKpis(allTrendsData);
  updateSpotlight(allTrendsData);
  renderTable();
}

/**
 * Updates pagination bar elements.
 */
function updatePaginationUi() {
  const startEl = document.getElementById("page-start");
  const endEl = document.getElementById("page-end");
  const totalEl = document.getElementById("total-trends-count");
  const currEl = document.getElementById("current-page");
  const totPagesEl = document.getElementById("total-pages");
  const prevBtn = document.getElementById("btn-prev-page");
  const nextBtn = document.getElementById("btn-next-page");

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

/**
 * Updates KPI Summary Cards based on current dataset.
 */
function updateKpis(items) {
  let peakVvs = 0;
  let noiseCount = 0;
  let emergingCount = 0;

  items.forEach(item => {
    if (item.vvs > peakVvs) peakVvs = item.vvs;
    if (item.status === "NOISE") noiseCount++;
    if (item.status === "EMERGING") emergingCount++;
  });

  const noiseRate = items.length > 0 ? Math.round((noiseCount / items.length) * 100) : 0;

  const kpiEmerging = document.getElementById("kpi-emerging");
  const kpiPeakVvs = document.getElementById("kpi-peak-vvs");
  const kpiNoiseRate = document.getElementById("kpi-noise-rate");

  if (kpiEmerging) kpiEmerging.textContent = emergingCount;
  if (kpiPeakVvs) kpiPeakVvs.textContent = peakVvs.toFixed(1);
  if (kpiNoiseRate) kpiNoiseRate.textContent = `${noiseRate}%`;
}

/**
 * Updates the Spotlight Card with the highest ranking emerging audio.
 */
function updateSpotlight(items) {
  const featured = items.find(item => item.type === "sound" && item.status === "EMERGING") || items[0];
  if (!featured) return;

  const titleEl = document.getElementById("featured-title");
  const idEl = document.getElementById("featured-id");
  const vvsEl = document.getElementById("featured-vvs");
  const velEl = document.getElementById("featured-velocity");

  if (titleEl) titleEl.textContent = featured.title || featured.id;
  if (idEl) idEl.textContent = featured.id;
  if (vvsEl) vvsEl.textContent = `${Number(featured.vvs || 0).toFixed(1)} / 100`;
  if (velEl) velEl.textContent = `+${featured.hourlyVelocity ?? 0} v/hr`;
}

/**
 * Renders the leaderboard table with clickable TikTok links (REQ-FR-14) and inspector buttons.
 */
function renderTable() {
  const tbody = document.getElementById("leaderboard-body");
  if (!tbody) return;

  if (!allTrendsData || allTrendsData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="table-loading">
          No trends found matching category <strong>"${escapeHtml(activeFilter)}"</strong> or search query.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = allTrendsData.map((item, index) => {
    const rank = (currentPage - 1) * pageSize + index + 1;
    const rankClass = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : rank === 3 ? "rank-3" : "";
    const typeIcon = item.type === "sound" ? "🎵" : "#️⃣";
    const status = item.status || "NOISE";
    const vvs = Number(item.vvs || 0).toFixed(1);
    const hourlyVelocity = item.hourlyVelocity ?? "0";
    const accel = item.acceleration !== undefined ? `${item.acceleration > 0 ? "+" : ""}${Number(item.acceleration).toFixed(1)}` : "—";
    const sparkline = renderSparklineSvg(item.historyDeltas || [0, Math.round(item.vvs || 0)]);

    // TikTok Direct Deep-Link (REQ-FR-14)
    const tiktokUrl = item.tiktokUrl || (item.type === "hashtag"
      ? `https://www.tiktok.com/tag/${encodeURIComponent((item.title || item.id).replace(/^#/, ""))}`
      : `https://www.tiktok.com/music/-${encodeURIComponent(item.id.replace(/^sound_/, ""))}`);

    const pred = item.saturationPrediction || {
      opportunityLevel: "PLATEAU",
      hoursToPeak: 0,
      opportunityWindow: "Plateau: Adoption velocity is flat or decelerating"
    };

    let horizonBadge = "";
    if (pred.opportunityLevel === "SURGING") {
      horizonBadge = `<span class="badge-mini" style="background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;" title="${escapeHtml(pred.opportunityWindow)}">⚡ Surging (~${pred.hoursToPeak}h)</span>`;
    } else if (pred.opportunityLevel === "PEAK") {
      horizonBadge = `<span class="badge-mini" style="background: #fffbeb; color: #92400e; border: 1px solid #fde68a;" title="${escapeHtml(pred.opportunityWindow)}">🔥 Peak Reached</span>`;
    } else {
      horizonBadge = `<span class="badge-mini" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;" title="${escapeHtml(pred.opportunityWindow)}">⏸ Plateaued</span>`;
    }

    return `
      <tr data-id="${escapeHtml(item.id)}">
        <td class="rank-cell ${rankClass}">#${rank}</td>
        <td>
          <span class="badge-mini">${typeIcon} ${escapeHtml(item.type)}</span>
        </td>
        <td>
          <div style="display: flex; flex-direction: column;">
            <a href="${tiktokUrl}" target="_blank" rel="noopener noreferrer" class="tiktok-link" title="Open official audio/tag page on TikTok">
              <span>${escapeHtml(item.title || item.id)}</span>
              <span class="external-icon">↗</span>
            </a>
            <a href="${tiktokUrl}" target="_blank" rel="noopener noreferrer" class="tiktok-sublink">
              ${escapeHtml(item.id)}
            </a>
          </div>
        </td>
        <td>
          <div class="vvs-wrapper">
            <span class="vvs-num">${vvs}</span>
            <div class="vvs-track">
              <div class="vvs-bar" style="width: ${Math.min(100, Math.max(0, item.vvs || 0))}%"></div>
            </div>
          </div>
        </td>
        <td>
          <div style="font-family: 'JetBrains Mono', monospace; font-weight: 600;">
            +${hourlyVelocity} <span style="font-size: 11px; color: var(--text-muted);">v/hr</span>
          </div>
          <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: ${item.acceleration > 0 ? "#059669" : "var(--text-muted)"};">
            acc: ${accel}
          </div>
        </td>
        <td>
          <span class="status-pill status-${status}">${escapeHtml(status)}</span>
        </td>
        <td>
          ${horizonBadge}
        </td>
        <td>
          ${sparkline}
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-outline-sm btn-deep-dive" data-id="${escapeHtml(item.id)}" title="Inspect 1h/6h/24h metrics and full history">
            📊 Detail
          </button>
          ${item.type === "sound" ? `
            <button class="btn btn-outline-sm btn-inspect" data-sound-id="${escapeHtml(item.id)}" title="View correlated hashtags">
              #️⃣ Tags
            </button>
          ` : `
            <button class="btn btn-outline-sm btn-copy-tag" data-tag-title="${escapeHtml(item.title || item.id)}" title="Copy hashtag">
              📋 Copy
            </button>
          `}
        </td>
      </tr>
    `;
  }).join("");

  // Attach Detail inspection handlers (REQ-FR-12 & REQ-FR-15)
  document.querySelectorAll(".btn-deep-dive").forEach(btn => {
    btn.addEventListener("click", () => {
      openTrendDetail(btn.dataset.id);
    });
  });

  // Attach hashtag correlation handlers
  document.querySelectorAll(".btn-inspect").forEach(btn => {
    btn.addEventListener("click", () => {
      inspectCorrelations(btn.dataset.soundId);
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
 * Opens Trend Deep-Dive Inspector Modal with full multi-window metrics (REQ-FR-12).
 * 
 * @param {string} trendId
 */
async function openTrendDetail(trendId) {
  const modal = document.getElementById("trend-detail-modal");
  if (!modal) return;

  try {
    const res = await fetch(`/api/trends/${encodeURIComponent(trendId)}/detail`);
    if (!res.ok) throw new Error("Could not retrieve trend detail");
    const d = await res.json();

    document.getElementById("modal-title").textContent = d.title || d.id;
    document.getElementById("modal-id").textContent = d.id;
    document.getElementById("modal-type-badge").textContent = `${d.type === "sound" ? "🎵" : "#️⃣"} ${d.type}`;

    const tiktokLink = document.getElementById("modal-tiktok-link");
    if (tiktokLink) {
      tiktokLink.href = d.tiktokUrl || "#";
    }

    document.getElementById("modal-vvs").textContent = Number(d.vvs || 0).toFixed(1);
    document.getElementById("modal-vel1h").textContent = `+${Number(d.hourlyVelocity || 0).toLocaleString()} v/hr`;
    document.getElementById("modal-delta6h").textContent = `+${Number(d.delta6h || 0).toLocaleString()} v`;
    document.getElementById("modal-delta24h").textContent = `+${Number(d.delta24h || 0).toLocaleString()} v`;
    document.getElementById("modal-accel").textContent = `${d.acceleration > 0 ? "+" : ""}${Number(d.acceleration || 0).toFixed(1)}`;

    const pred = d.saturationPrediction || { opportunityLevel: "PLATEAU", hoursToPeak: 0 };
    document.getElementById("modal-horizon").textContent = pred.opportunityLevel === "SURGING"
      ? `⚡ Surging (~${pred.hoursToPeak}h remaining)`
      : pred.opportunityLevel === "PEAK" ? "🔥 Peak Saturation" : "⏸ Plateaued";

    // Associated hashtags
    const tagsList = document.getElementById("modal-tags-list");
    if (tagsList) {
      if (d.correlatedHashtags && d.correlatedHashtags.length > 0) {
        tagsList.innerHTML = d.correlatedHashtags.map(t => `
          <a href="https://www.tiktok.com/tag/${encodeURIComponent(t.replace("#", ""))}" target="_blank" rel="noopener noreferrer" class="tag-item">
            ${escapeHtml(t)} ↗
          </a>
        `).join(" ");
      } else {
        tagsList.innerHTML = `<span style="color: var(--text-muted); font-size: 12px;">No correlated hashtags detected for this audio.</span>`;
      }
    }

    // Snapshots timeseries table
    const snapBody = document.getElementById("modal-snapshots-body");
    if (snapBody) {
      const sn = d.snapshots || [];
      if (sn.length === 0) {
        snapBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">No chronological snapshots recorded yet.</td></tr>`;
      } else {
        snapBody.innerHTML = sn.slice(-24).map((s, idx, arr) => {
          const prev = idx > 0 ? arr[idx - 1] : s;
          const diff = Math.max(0, s.totalVideos - prev.totalVideos);
          return `
            <tr>
              <td style="font-family: monospace;">${escapeHtml(new Date(s.timestamp).toLocaleTimeString())}</td>
              <td>${Number(s.totalViews).toLocaleString()}</td>
              <td>${Number(s.totalVideos).toLocaleString()}</td>
              <td style="font-weight: 600; color: ${diff > 0 ? "#059669" : "var(--text-muted)"};">+${diff.toLocaleString()} v</td>
            </tr>
          `;
        }).join("");
      }
    }

    modal.classList.remove("hidden");
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
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
            <a href="https://www.tiktok.com/tag/${encodeURIComponent(tag.replace('#', ''))}" target="_blank" rel="noopener noreferrer" class="tag-item" title="Click to view on TikTok">
              ${escapeHtml(tag)} ↗
            </a>
          `).join("")}
        </div>
        <button id="btn-copy-all-tags" class="btn btn-outline-sm" style="margin-top: 10px; align-self: flex-start;">
          📋 Copy All ${data.correlatedHashtags.length} Tags to Clipboard
        </button>
      </div>
    `;

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
 * Handles high-scale ingestion (1,000 or 2,500 items, REQ-FR-13).
 * 
 * @param {number} scale
 */
async function handleIngestScale(scale = 1000) {
  const btn = document.getElementById(scale === 2500 ? "btn-ingest-2500" : "btn-ingest-1000");
  const origText = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Ingesting ${scale.toLocaleString()} Items into SQLite...`;
  }

  try {
    const res = await fetch(`/api/ingest/fetch?provider=mock&scale=${scale}`, {
      method: "POST"
    });
    const data = await res.json();
    if (res.ok) {
      currentPage = 1;
      await loadDashboard();
      showToast(`Ingested ${data.ingestedCount.toLocaleString()} trends into SQLite! (REQ-FR-13)`);
    } else {
      showToast(`Ingestion error: ${data.message || data.error}`);
    }
  } catch (err) {
    showToast(`Network error: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  }
}

/**
 * Ingests trending items from live external TikTok feeds (REQ-FR-10).
 */
async function handleFetchLive() {
  const btn = document.getElementById("btn-fetch-live");
  const origHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Ingesting Live Feed...`;
  }
  try {
    const res = await fetch("/api/ingest/fetch?provider=creative_center", {
      method: "POST"
    });
    const data = await res.json();
    if (res.ok) {
      currentPage = 1;
      await loadDashboard();
      showToast(`Live TikTok feed ingested! (${data.ingestedCount} trends from ${data.provider})`);
    } else {
      showToast(`Ingestion error: ${data.message || data.error}`);
    }
  } catch (err) {
    showToast(`Network error ingesting feed: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml || `<span>🌐</span> Fetch Live TikTok Feed`;
    }
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
      currentPage = 1;
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
    currentPage = 1;
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
    currentPage = 1;
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
