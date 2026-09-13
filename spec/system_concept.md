# System Concept: TrendTok Analytics

**Document Type:** Natural Language Concept Specification  
**Status:** Draft / Baseline (SDD Phase 1)  
**Project:** TrendTok Analytics (TikTok Viral Content Analytics Web Service)  
**Date:** 2026-09-13  

---

## 1. Vision and Strategic Purpose

In social media ecosystems—specifically TikTok—trends propagate and saturate at an unprecedented pace, often within a 48 to 72-hour timeframe. Traditional social listening platforms frequently lag behind due to batch processing delays or insufficient granular focus on audio and hashtag velocity.

**TrendTok Analytics** is an automated information system designed to ingest, process, evaluate, and visualize trending elements across TikTok. Its primary purpose is to empower media marketers, creative agencies, and digital creators to identify viral trends at an *emerging* phase rather than after saturation.

---

## 2. Target Stakeholders and Use Cases

| Stakeholder | Primary Goals & Value Proposition |
|---|---|
| **SMM Strategists** | Identify rising sounds and viral formats to plan proactive brand campaigns. |
| **Content Creators** | Discover relevant background sounds and hashtags with high growth potential for algorithmic discoverability. |
| **Media & Market Analysts** | Study media consumption shifts, hashtag longevity, and cross-topic virality dynamics. |
| **System Administrators** | Monitor scraping worker health, API rate budgets, and trend calculation throughput. |

---

## 3. High-Level System Architecture

The system operates across four primary conceptual subsystems:

```
[ TikTok Data Streams ]
         │
         ▼
[ 1. Ingestion Worker / Scraper ] ───▶ [ Raw Snapshots Storage ]
                                                  │
                                                  ▼
                                     [ 2. Virality & Velocity Engine ]
                                                  │
                                                  ▼
[ 4. Alert & Notification Gateway ] ◀── [ Trend Registry & Metrics DB ]
                                                  │
                                                  ▼
                                     [ 3. Web Visualization Dashboard ]
```

### 3.1. Ingestion Subsystem (Scraper Worker)
* Periodically collects engagement metrics for top hashtags, audio tracks, and discover page entries.
* Captures metric points: total view counts, video creation volume, author reach, and engagement indicators.
* Operates under configurable scraping intervals and rate-limit guardrails.

### 3.2. Analytics & Virality Engine
* Computes trend velocity: the first derivative of engagement metrics over discrete sliding time windows (e.g., 1h, 6h, 24h).
* Calculates a normalized **Virality Velocity Score (VVS)** ranging between 0 and 100.
* Classifies items into three lifecycle stages:
  1. **Emerging** (acceleration > threshold, total volume still low-to-medium).
  2. **Peak** (high volume, velocity stabilizing or near zero).
  3. **Declining** (negative velocity, drop in video creation rate).

### 3.3. Web Visualization Dashboard
* Real-time leaderboard of trending audio, hashtags, and formats sorted by velocity or absolute volume.
* Historical trajectory charts showing metric progression over time.
* Filtering by geographic market (e.g., Global, Ukraine, US) and category tags.

### 3.4. Alerting & Integration Subsystem
* Custom triggers configurable by users (e.g., "Alert me if a sound in the 'Tech' category exceeds 50k new videos within 4 hours").
* Delivery channels: Webhooks, Telegram bot notifications, and in-app feeds.

---

## 4. Core Conceptual Entities

* **TrendItem**: Represents an identifiable viral unit (Hashtag, Audio Track, Effect/Filter).
  * `id`: Unique identifier
  * `type`: Enum (`HASHTAG`, `AUDIO`, `EFFECT`)
  * `title`: Canonical name or track title
  * `external_id`: TikTok platform identifier
  * `first_detected_at`: UTC timestamp of first system detection
* **MetricSnapshot**: Discrete observation of a `TrendItem` at a given point in time.
  * `item_id`: Reference to `TrendItem`
  * `captured_at`: UTC timestamp
  * `view_count`: Aggregate views
  * `video_count`: Number of videos utilizing the item
  * `velocity_score`: Computed virality index
* **TrendAlertRule**: User-defined monitoring rule.
  * `rule_id`: Identifier
  * `metric_type`: Monitored variable (e.g., `hourly_video_growth`)
  * `threshold`: Numerical boundary
  * `target_channel`: Dispatch endpoint

---

## 5. Non-Functional Constraints & Baseline Principles

* **Data Freshness**: Ingestion cycle interval must not exceed 15 minutes for top-tier trends.
* **Traceability (SDD Compliance)**: Every system component, database model, and test suite must directly trace back to requirements documented in `/spec`.
* **Resilience**: Graceful backoff and queue buffering when encountering TikTok rate limiting or structural DOM changes.

---

## 6. Open Issues & Input for Lab #2 (SKED Dialogue & SRS)

The following aspects require formal specification during the next SDD milestone:
1. Exact mathematical formulation of the **Virality Velocity Score (VVS)** (linear vs exponential decay weighting).
2. Data collection legal and technical boundaries (unofficial endpoints vs third-party scraping APIs vs TikTok Research API).
3. Metric retention policies and time-series database selection (e.g., TimescaleDB, ClickHouse, or SQLite for initial prototype).
