# Requirements Traceability Matrix (RTM)
## TrendTok Analytics — SDD Phase 2 & 3 Baseline

**Document Identifier:** `RTM-TRENDTOK-2026-V2`  
**Associated SRS:** [`spec/srs.md`](srs.md) (`SRS-TRENDTOK-2026-V2`)  
**Project Plan:** [`docs/plan_and_risks.md`](../docs/plan_and_risks.md)  
**Status:** Active / Verified  
**Date:** October 2026  

---

## 1. Overview & SDD Traceability Guarantee

In accordance with **Specification-Driven Development (SDD)**, every production line of code in `/src`, every test assertion in `/tests`, and every task in the bug tracking system must be directly justified by an approved requirement in `/spec`. The matrix below provides a bidirectional mapping ensuring that:
1. No requirement is left without automated test verification (**zero orphaned requirements**).
2. No code is implemented without a corresponding requirement (**zero unjustified code**).
3. Every requirement is bound to concrete tracking units in the issue tracker (**100% ticket traceability**).

---

## 2. Bidirectional Traceability Mapping

| Business Goal / Need | SRS Requirement | SDLC Ticket ID | BDD Acceptance Scenario | Test Identifier | Implementation Component | Verification Status |
|---|---|:---:|---|---|---|:---:|
| **Eliminate false positives from micro-samples (Gate GIT-GATE-01)** | `REQ-FR-02` (Differentiated Noise Suppression) | `TT-TEST-02`<br>`TT-FEAT-02` | `BDD-02` (Hashtag Noise Floor Suppression) | `test/trendScorer: noise-guard-sound`<br>`test/trendScorer: noise-guard-hashtag` | `src/trendScorer.js` (`checkNoiseGuardrail`) | **VERIFIED (PASS)** |
| **Detect exponential virality before saturation** | `REQ-FR-03` (Multi-Window VVS Calculation) | `TT-TEST-03`<br>`TT-FEAT-03` | `BDD-01` (Sound Early Virality Detection) | `test/trendScorer: multi-window-vvs`<br>`test/trendScorer: single-window-fallback` | `src/trendScorer.js` (`calculateMultiWindowVVS`) | **VERIFIED (PASS)** |
| **Classify virality lifecycle stages** | `REQ-FR-04` (Trend Lifecycle State Transitions) | `TT-TEST-04`<br>`TT-FEAT-04` | `BDD-01`, `BDD-03` (Saturation Transition) | `test/trendScorer: state-machine-transitions` | `src/trendScorer.js` (`determineLifecycleStatus`) | **VERIFIED (PASS)** |
| **Ingest discrete metric snapshots via REST** | `REQ-FR-01` (Snapshot Ingestion API) | `TT-TEST-01`<br>`TT-FEAT-01` | `Contract: POST /api/snapshots` | `test/api: ingest-snapshots` | `src/index.js` (`handleIngestSnapshots`) | **VERIFIED (PASS)** |
| **Surface emerging trends for SMM creators** | `REQ-FR-05` (Emerging Leaderboard Query) | `TT-TEST-05`<br>`TT-FEAT-05` | `Contract: GET /api/trends/emerging` | `test/api: query-emerging-trends` | `src/index.js` (`handleGetEmergingTrends`) | **VERIFIED (PASS)** |
| **Discover sound + hashtag viral combos** | `REQ-FR-06` (Cross-Entity Correlation) | `TT-TEST-05`<br>`TT-FEAT-05` | `Contract: GET /api/trends/:id/correlations` | `test/api: sound-hashtag-correlations` | `src/index.js` (`handleGetCorrelations`) | **VERIFIED (PASS)** |
| **Deterministic testing and evaluation** | `REQ-FR-07` (Golden Set Simulation Loader) | `TT-TEST-06`<br>`TT-FEAT-06` | `Contract: POST /api/simulation/seed` | `test/api: seed-golden-set` | `src/index.js` (`handleSeedSimulation`) | **VERIFIED (PASS)** |
| **High computational speed** | `REQ-NFR-01` (Latency < 0.5ms per calculation) | `TT-TEST-03`<br>`TT-VERIF-01` | Benchmark timing assertion | `test/trendScorer: performance-benchmark` | `src/trendScorer.js` (Pure algorithm) | **VERIFIED (PASS)** |
| **Resilience & Input Validation** | `REQ-NFR-03` (Fail-fast on corrupt data) | `TT-TEST-01`<br>`TT-FEAT-01` | Negative test assertions | `test/trendScorer: edge-cases-validation` | `src/trendScorer.js` (Input guards) | **VERIFIED (PASS)** |
| **Memory bounding & rolling buffer** | `REQ-NFR-02` (24h TTL Pruning) | `TT-TEST-06`<br>`TT-FEAT-06` | Memory buffer eviction check | `test/storage: ttl-pruning-sliding-window` | `src/index.js` (In-Memory Ring Store) | **VERIFIED (PASS)** |
| **Visual intelligence & real-time dashboard** | `REQ-FR-08` (Interactive Web Dashboard) | `TT-ADD-01` | Contract: `GET /`, `GET /dashboard.css`, `GET /dashboard.js` | `test/api: ui-dashboard-serving` | `src/public/index.html`, `src/public/dashboard.css`, `src/public/dashboard.js`, `src/index.js` | **VERIFIED (PASS)** |
| **Interactive simulation & time control** | `REQ-FR-09` (Simulation & Time-Step Controller) | `TT-ADD-01` | Contract: `POST /api/simulation/step`, `POST /api/simulation/inject` | `test/api: simulation-step-controller` | `src/index.js` (`handleSimulationStep`, `handleSimulationInject`) | **VERIFIED (PASS)** |
| **Live external TikTok feed ingestion** | `REQ-FR-10` (Pluggable Feed Ingestion Engine) | `TT-ADD-02` | Contract: `POST /api/ingest/fetch` | `test/api: live-feed-ingestion` | `src/ingestionClient.js`, `src/index.js` | **VERIFIED (PASS)** |
| **Predictive trajectory & saturation calculus** | `REQ-FR-11` (Predictive Trajectory & Saturation) | `TT-ADD-02` | Mathematical assertion on saturation hours | `test/trendScorer: saturation-prediction` | `src/trendScorer.js` (`predictSaturationWindow`) | **VERIFIED (PASS)** |
| **Native SQLite multi-tier persistence** | `REQ-FR-12` (SQLite Store & 7d Retention) | `TT-ADD-03`<br>`TT-GATE-03` | Contract: `GET /api/trends/:id/detail` & SQLite queries | `test/storage: sqlite-multi-tier-retention` | `src/db.js`, `src/index.js` | **VERIFIED (PASS)** |
| **High-scale corpus ingestion (1,000–2,500+)** | `REQ-FR-13` (High-Scale Trend Corpus) | `TT-ADD-03` | Ingestion benchmark of 1,000+ items across stages | `test/ingestion: high-scale-corpus-generation` | `src/ingestionClient.js` | **VERIFIED (PASS)** |
| **Direct TikTok deep-linking architecture** | `REQ-FR-14` (Direct TikTok Search/Deep Links) | `TT-ADD-03` | URL formatting contract validation (zero 404s) | `test/api: tiktok-deep-links` | `src/public/dashboard.js`, `src/db.js`, `src/ingestionClient.js`, `src/index.js` | **VERIFIED (PASS)** |
| **Scalable UI with pagination & categories** | `REQ-FR-15` (Pagination, Categories & Multi-Column Sorting) | `TT-ADD-03` | DOM rendering, page size switcher, and sort assertions | `test/api: paginated-trends-query` | `src/public/dashboard.js`, `src/public/index.html`, `src/db.js` | **VERIFIED (PASS)** |
| **Decoupled collectors & evergreen stop-list** | `REQ-FR-16` (Creative Center Chrome Agent, Google Trends RSS & Stop-List) | `TT-ADD-04` | Stop-word pruning, Creative Center CDP & Google Trends XML parsing | `test/collectors: stop-words-and-rss` | `src/collectors/stopWords.js`, `src/collectors/creativeCenterAgent.js`, `src/collectors/hashtagCollector.js`, `src/collectors/musicCollector.js`, `src/collectors/collectorWorker.js` | **VERIFIED (PASS)** |
| **Dual forecasting & evolutionary tuning** | `REQ-FR-17` (Sound/Hashtag Forecasters & Genetic Tuner) | `TT-ADD-04` | Backtest MAPE & evolutionary generation convergence | `test/forecasting: dual-models-and-ga` | `src/analytics/soundForecaster.js`, `src/analytics/hashtagForecaster.js`, `src/analytics/evolutionaryTuner.js` | **VERIFIED (PASS)** |
| **Hashtag Triad 1-2-3 Recommendation** | `REQ-FR-18` (Breakout Hashtag Triad 1-2-3 Engine) | `TT-ADD-04` | Non-stopword 3-tag combo generation | `test/forecasting: triad-recommender` | `src/analytics/triadRecommender.js`, `src/index.js`, `src/public/dashboard.js` | **VERIFIED (PASS)** |
| **Enterprise SaaS UI aesthetics & typography** | `REQ-NFR-05` (Clean Typography & Zero Emojis) | `TT-ADD-01` | UI static review and CSS badge verification | `test/api: ui-dashboard-serving` | `src/public/index.html`, `src/public/dashboard.css`, `src/public/dashboard.js` | **VERIFIED (PASS)** |

---

## 3. Coverage Analysis Summary

* **Total Functional Requirements (FR):** 18
* **Total Non-Functional Requirements (NFR):** 5
* **Requirements with Automated Test Coverage:** 23 / 23 (100% targeted)
* **Requirements with Bound Tracking Tickets:** 23 / 23 (100% traceable)
* **Orphaned Requirements:** 0
* **Unjustified Code Modules:** 0
