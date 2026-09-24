/**
 * TrendTok Analytics - Embedded SQLite Database Module (REQ-FR-12)
 * 
 * Implements high-performance, zero-dependency persistence using native node:sqlite.
 * Supports multi-window historical telemetry, 7-day retention pruning, and indexed queries.
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  checkNoiseGuardrail,
  calculateMultiWindowVVS,
  determineLifecycleStatus,
  predictSaturationWindow
} from "./trendScorer.js";

/**
 * Initializes and configures the SQLite database.
 * 
 * @param {string} [dbPath=":memory:"] - File path or ':memory:'
 * @returns {DatabaseSync} Configured SQLite database instance
 */
export function initDatabase(dbPath = ":memory:") {
  if (dbPath !== ":memory:") {
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);

  // Enable WAL mode & foreign keys for high-concurrency performance
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    if (dbPath !== ":memory:") {
      db.exec("PRAGMA journal_mode = WAL;");
    }
  } catch (e) {
    // WAL pragma might be ignored in in-memory
  }

  // DDL Schema definitions
  db.exec(`
    CREATE TABLE IF NOT EXISTS trends (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT,
      external_url TEXT,
      first_detected_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trend_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      total_views INTEGER NOT NULL,
      total_videos INTEGER NOT NULL,
      FOREIGN KEY(trend_id) REFERENCES trends(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS correlations (
      sound_id TEXT NOT NULL,
      hashtag TEXT NOT NULL,
      frequency INTEGER DEFAULT 1,
      PRIMARY KEY (sound_id, hashtag)
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_trend_time ON snapshots(trend_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON snapshots(timestamp);
    CREATE INDEX IF NOT EXISTS idx_trends_type ON trends(type);
  `);

  return db;
}

/**
 * Repository wrapper providing typed, safe analytical query operations over SQLite.
 */
export class TrendRepository {
  /**
   * @param {DatabaseSync} db
   */
  constructor(db) {
    this.db = db;
    this.prepareStatements();
  }

  /**
   * Pre-compiles SQL prepared statements for microsecond execution.
   */
  prepareStatements() {
    this.stmtUpsertTrend = this.db.prepare(`
      INSERT INTO trends (id, type, title, author, external_url, first_detected_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        author = COALESCE(excluded.author, trends.author),
        external_url = COALESCE(excluded.external_url, trends.external_url)
    `);

    this.stmtInsertSnapshot = this.db.prepare(`
      INSERT INTO snapshots (trend_id, timestamp, total_views, total_videos)
      VALUES (?, ?, ?, ?)
    `);

    this.stmtGetTrend = this.db.prepare(`
      SELECT * FROM trends WHERE id = ?
    `);

    this.stmtGetSnapshots = this.db.prepare(`
      SELECT timestamp, total_views, total_videos
      FROM snapshots
      WHERE trend_id = ?
      ORDER BY timestamp ASC
    `);

    this.stmtGetLatestSnapshot = this.db.prepare(`
      SELECT timestamp, total_views, total_videos
      FROM snapshots
      WHERE trend_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    this.stmtUpsertCorrelation = this.db.prepare(`
      INSERT INTO correlations (sound_id, hashtag, frequency)
      VALUES (?, ?, 1)
      ON CONFLICT(sound_id, hashtag) DO UPDATE SET
        frequency = correlations.frequency + 1
    `);

    this.stmtGetCorrelations = this.db.prepare(`
      SELECT hashtag, frequency
      FROM correlations
      WHERE sound_id = ?
      ORDER BY frequency DESC, hashtag ASC
    `);

    this.stmtPruneSnapshots = this.db.prepare(`
      DELETE FROM snapshots
      WHERE timestamp < datetime('now', ?)
    `);
  }

  /**
   * Upserts trend metadata.
   */
  upsertTrend({ id, type, title, author = null, external_url = null, first_detected_at = null }) {
    const detectedAt = first_detected_at || new Date().toISOString();
    this.stmtUpsertTrend.run(id, type, title || id, author, external_url, detectedAt);
  }

  /**
   * Appends a metric snapshot for a trend.
   */
  insertSnapshot({ trend_id, timestamp, total_views, total_videos }) {
    const ts = timestamp || new Date().toISOString();
    const views = Math.max(0, Math.floor(Number(total_views) || 0));
    const videos = Math.max(0, Math.floor(Number(total_videos) || 0));
    this.stmtInsertSnapshot.run(trend_id, ts, views, videos);
  }

  /**
   * Ingests a batch of normalized records atomically within a transaction.
   * 
   * @param {Array<Object>} records - Array of trend & snapshot objects
   * @returns {number} Ingested record count
   */
  insertBatch(records) {
    if (!Array.isArray(records) || records.length === 0) return 0;

    this.db.exec("BEGIN");
    try {
      for (const rec of records) {
        // Determine canonical TikTok external URL (REQ-FR-14)
        let externalUrl = rec.external_url || rec.tiktokUrl;
        if (!externalUrl) {
          if (rec.type === "hashtag") {
            const cleanTag = (rec.title || rec.itemId).replace(/^#/, "");
            externalUrl = `https://www.tiktok.com/tag/${encodeURIComponent(cleanTag)}`;
          } else {
            const soundId = rec.itemId.replace(/^sound_/, "");
            externalUrl = `https://www.tiktok.com/music/-${encodeURIComponent(soundId)}`;
          }
        }

        this.upsertTrend({
          id: rec.itemId,
          type: rec.type || "sound",
          title: rec.title || rec.itemId,
          author: rec.author || null,
          external_url: externalUrl,
          first_detected_at: rec.previousTimestamp || rec.timestamp || new Date().toISOString()
        });

        // Insert previous baseline snapshot if provided
        if (rec.previousTimestamp && typeof rec.previousViews === "number") {
          this.insertSnapshot({
            trend_id: rec.itemId,
            timestamp: rec.previousTimestamp,
            total_views: rec.previousViews,
            total_videos: rec.previousVideos || 0
          });
        }

        // Insert current snapshot
        this.insertSnapshot({
          trend_id: rec.itemId,
          timestamp: rec.timestamp || new Date().toISOString(),
          total_views: rec.totalViews,
          total_videos: rec.totalVideos
        });

        // Save sound-hashtag correlations if present
        if (rec.type === "sound" && Array.isArray(rec.hashtags)) {
          for (const tag of rec.hashtags) {
            this.stmtUpsertCorrelation.run(rec.itemId, tag);
          }
        }
      }
      this.db.exec("COMMIT");
      return records.length;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /**
   * Retrieves snapshots for an entity.
   */
  getSnapshots(trendId) {
    return this.stmtGetSnapshots.all(trendId).map(s => ({
      timestamp: s.timestamp,
      totalViews: s.total_views,
      totalVideos: s.total_videos
    }));
  }

  /**
   * Calculates comprehensive trend metrics and returns enriched entity DTO.
   */
  calculateTrendMetrics(trend) {
    const sn = this.getSnapshots(trend.id);
    if (sn.length === 0) {
      return null;
    }

    const latest = sn[sn.length - 1];
    const prev = sn.length >= 2 ? sn[sn.length - 2] : null;

    // Multi-Window Deltas
    const delta1h = prev ? Math.max(0, latest.totalVideos - prev.totalVideos) : 0;
    const views1h = prev ? Math.max(0, latest.totalViews - prev.totalViews) : 0;

    // Multi-Window 6h delta
    let delta6h = delta1h;
    if (sn.length >= 6) {
      const idx6h = Math.max(0, sn.length - 6);
      delta6h = Math.max(0, latest.totalVideos - sn[idx6h].totalVideos);
    }

    // Multi-Window 24h delta
    let delta24h = delta1h;
    if (sn.length >= 24) {
      const idx24h = Math.max(0, sn.length - 24);
      delta24h = Math.max(0, latest.totalVideos - sn[idx24h].totalVideos);
    } else if (sn.length > 1) {
      delta24h = Math.max(0, latest.totalVideos - sn[0].totalVideos);
    }

    // Noise guardrail
    const guardrail = checkNoiseGuardrail({
      totalViews: latest.totalViews,
      deltaVideos1h: delta1h,
      type: trend.type
    });

    let vvs = 0.0;
    let acceleration = 0.0;
    let status = "NOISE";

    if (guardrail.pass) {
      const vvsResult = calculateMultiWindowVVS(sn, trend.type);
      vvs = vvsResult.vvs;
      acceleration = vvsResult.acceleration;
      status = determineLifecycleStatus({ vvs, acceleration, type: trend.type });
    }

    // Saturation horizon prediction (REQ-FR-11)
    const saturationPrediction = predictSaturationWindow({
      velocity1h: delta1h,
      acceleration,
      type: trend.type
    });

    // History deltas for sparklines
    const historyDeltas = [];
    for (let i = 1; i < sn.length; i++) {
      historyDeltas.push(Math.max(0, sn[i].totalVideos - sn[i - 1].totalVideos));
    }

    return {
      id: trend.id,
      type: trend.type,
      title: trend.title,
      author: trend.author,
      tiktokUrl: trend.external_url,
      vvs,
      status,
      hourlyVelocity: delta1h,
      delta6h,
      delta24h,
      acceleration,
      saturationPrediction,
      totalViews: latest.totalViews,
      totalVideos: latest.totalVideos,
      snapshotsCount: sn.length,
      historyDeltas: historyDeltas.slice(-12),
      firstDetectedAt: trend.first_detected_at
    };
  }

  /**
   * Retrieves enriched trends with pagination and filtering (REQ-FR-15).
   * 
   * @param {Object} options
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @param {string} [options.type] - 'sound' | 'hashtag'
   * @param {string} [options.category] - 'all' | 'surge1h' | 'breakout6h' | 'viral24h' | 'noise' | 'saturated'
   * @param {string} [options.search]
   * @param {string} [options.sortBy='vvs'] - 'vvs' | 'velocity' | 'views' | 'acceleration'
   * @returns {{ items: Array<Object>, totalCount: number, page: number, totalPages: number }}
   */
  queryTrendsPaged({ limit = 50, offset = 0, type = null, category = "all", search = null, sortBy = "vvs" } = {}) {
    let sql = "SELECT * FROM trends WHERE 1=1";
    const params = [];

    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }

    if (search) {
      sql += " AND (title LIKE ? OR id LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    const allTrends = this.db.prepare(sql).all(...params);

    // Calculate metrics for all matching entities
    let enriched = [];
    for (const t of allTrends) {
      const metrics = this.calculateTrendMetrics(t);
      if (metrics) {
        enriched.push(metrics);
      }
    }

    // Apply Category Filter (REQ-FR-15)
    if (category === "surge1h") {
      enriched = enriched.filter(item => item.hourlyVelocity > 30 && item.acceleration > 0);
    } else if (category === "breakout6h") {
      enriched = enriched.filter(item => item.delta6h > 100 && item.status === "EMERGING");
    } else if (category === "viral24h") {
      enriched = enriched.filter(item => item.status === "VIRAL");
    } else if (category === "noise") {
      enriched = enriched.filter(item => item.status === "NOISE");
    } else if (category === "saturated") {
      enriched = enriched.filter(item => item.status === "SATURATED");
    }

    // Sort items
    if (sortBy === "velocity") {
      enriched.sort((a, b) => b.hourlyVelocity - a.hourlyVelocity);
    } else if (sortBy === "delta6h") {
      enriched.sort((a, b) => b.delta6h - a.delta6h);
    } else if (sortBy === "views") {
      enriched.sort((a, b) => b.totalViews - a.totalViews);
    } else if (sortBy === "acceleration") {
      enriched.sort((a, b) => b.acceleration - a.acceleration);
    } else {
      enriched.sort((a, b) => b.vvs - a.vvs);
    }

    const totalCount = enriched.length;
    const pageItems = enriched.slice(offset, offset + limit);
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const page = Math.floor(offset / limit) + 1;

    return {
      items: pageItems,
      totalCount,
      page,
      totalPages,
      limit,
      offset
    };
  }

  /**
   * Retrieves full historical detail for an individual trend (REQ-FR-12).
   */
  getTrendDetail(trendId) {
    const trend = this.stmtGetTrend.get(trendId);
    if (!trend) return null;

    const metrics = this.calculateTrendMetrics(trend);
    if (!metrics) return null;

    const snapshots = this.getSnapshots(trendId);
    const correlations = this.stmtGetCorrelations.all(trendId).map(c => c.hashtag);

    return {
      ...metrics,
      snapshots,
      correlatedHashtags: correlations
    };
  }

  /**
   * Prunes snapshots older than retentionDays (defaults to 7 days, REQ-FR-12).
   */
  pruneSnapshots(retentionDays = 7) {
    const modifier = `-${Math.max(1, retentionDays)} days`;
    this.stmtPruneSnapshots.run(modifier);
  }

  /**
   * Returns count of tracked trends.
   */
  getStats() {
    const trendCount = this.db.prepare("SELECT COUNT(*) as c FROM trends").get().c;
    const snapshotCount = this.db.prepare("SELECT COUNT(*) as c FROM snapshots").get().c;
    return {
      trendCount,
      snapshotCount
    };
  }
}
