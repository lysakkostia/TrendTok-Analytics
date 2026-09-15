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

## 6. Open Issues & Resolution Status (SDD Baseline v2.0)

All issues identified during Phase 1 have been formally resolved during the Laboratory Work #2 SKED dialogue and codified into [`spec/srs.md`](srs.md):
1. **Virality Velocity Score (VVS) formulation**: RESOLVED in `srs.md` Section 3.1 (`REQ-F-003`) and Addendum A (weighted multi-window model: $0.50 \cdot V_{1\text{h}} + 0.35 \cdot V_{6\text{h}} + 0.15 \cdot V_{24\text{h}}$).
2. **Data ingestion boundaries**: RESOLVED in `srs.md` Section 1.2 and Section 3.1 (`REQ-F-001`, `REQ-F-007`) via batch REST ingestion (`POST /api/snapshots`) and deterministic Golden Set simulation.
3. **Metric retention & persistence**: RESOLVED in `srs.md` Section 2.3 and Section 3.2 (`REQ-NF-002`) via in-memory 24-hour circular rolling buffer with TTL eviction.
4. **Issue REQ-L2-01 (Noise Guardrail)**: RESOLVED in `srs.md` Section 3.1 (`REQ-F-002`) via entity-differentiated thresholds (Sound: 15k views, 30 delta; Hashtag: 25k views, 100 delta).
5. **Issue REQ-L2-02 (Multi-tier sliding windows)**: RESOLVED in `srs.md` Section 3.1 (`REQ-F-003`) and Addendum A.
6. **Approval & Gate**: Formally audited and frozen under [`logs/spec_gate_decision.md`](../logs/spec_gate_decision.md) (`SPEC-GATE-01`).
