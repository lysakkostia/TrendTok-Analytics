# SKED Dialogue Protocol & Session Log (Lab #2)

**Session Identifier:** `SKED-SESSION-02`  
**Target Repository:** `TrendTok Analytics`  
**Date:** 2026-09-15  
**Participants:**
* **Human-Initiator ($H$):** Lysak Kostiantyn (IV course, Group KN-32)
* **AI Spec Analyst ($M$):** Google Antigravity (Gemini 3.8 Flash High)
**Methodology:** Socratic Knowledge Elicitation & Documentation (SKED)  
**Status:** Converged ($\delta < \epsilon$) & Approved  

---

## 1. Phase 1: Initialization

* **Initial Topic ($T$):** Web service for real-time TikTok viral trend detection (`TrendTok Analytics`).
* **Input Artifacts:**
  * Initial concept: `spec/system_concept.md` (v1.0);
  * Conflict resolution log: `logs/git_gate_decision.md` (Checkpoint `GIT-GATE-01`);
  * Open requirements carried over from Lab #1:
    * `REQ-L2-01`: Need for explicit numerical thresholds to filter noise on nascent trends.
    * `REQ-L2-02`: Need for multi-window velocity weighting (1h, 6h, 24h).
* **Initial Agent Knowledge Frame ($K_M^{(0)}$):**
  Baseline understanding established from the repository structure, code in `src/trendScorer.js`, and the conflict between static thresholds and first-derivative velocity models.

---

## 2. Phase 2: Socratic Dialogue Rounds

### Round 1: Boundary Elicitation & Parameter Discovery
* **AI (Maieutics):**
  1. *Entity Scope:* Should the system monitor sounds, hashtags, or both?
  2. *Noise Guardrail (`REQ-L2-01`):* What exact numerical boundary suppresses micro-sample anomalies (e.g. 1 to 5 views showing +400%)? (AI suggested: `total_views >= 10k`, `delta_videos >= 50`).
  3. *Multi-Window Velocity (`REQ-L2-02`):* How to weight 1h, 6h, 24h windows? (AI suggested: $w_1 = 0.5, w_6 = 0.35, w_{24} = 0.15$).
  4. *Ingestion Strategy:* External scraper vs REST API + Synthetic Golden Set loader?
  5. *Persistence Layer:* In-memory sliding buffer vs File JSON vs SQLite?
  6. *API Surface:* Minimal vs expanded REST endpoints?

* **Human (Elenchus & Domain Clarification):**
  1. Sounds are a primary viral driver, but both sounds and hashtags must be supported, including correlations ("sound + trend combo").
  2. **Critical refinement by Human:** *Sound and hashtag thresholds should be differentiated* because the viral mechanics of music audio (reused across user creations) fundamentally differ from hashtag taggings.
  3. Agrees with the multi-window weighting formula ($0.5, 0.35, 0.15$).
  4. Selects Option 4A: REST API `POST /api/snapshots` + built-in deterministic simulation seed loader.
  5. Selects Option 5A: In-memory store with circular buffer and TTL pruning for pure zero-dependency performance.
  6. Requests expanding beyond minimal API endpoints to support richer analytics.

### Round 2: Dialectic Synthesis & BDD Formalization
* **AI (Dialectic Synthesis):**
  * Formulated exact differentiated noise boundaries:
    * `sound`: `MIN_TOTAL_VIEWS = 15,000`, `MIN_DELTA_VIDEOS_1H = 30`.
    * `hashtag`: `MIN_TOTAL_VIEWS = 25,000`, `MIN_DELTA_VIDEOS_1H = 100`.
  * Defined 5-stage Trend Lifecycle State Machine: `NOISE` $\to$ `EMERGING` $\to$ `VIRAL` $\to$ `SATURATED` $\to$ `DECAYING`.
  * Expanded REST API catalog: `GET /api/health`, `POST /api/snapshots`, `GET /api/trends`, `GET /api/trends/emerging`, `GET /api/trends/:id`, `GET /api/trends/:id/correlations`, `POST /api/simulation/seed`.
  * Drafted three formal BDD Gherkin scenarios for early detection, noise guardrail suppression, and saturation transition.

* **Human (Convergence Confirmation):**
  * Expressed agreement ("так все гуд").

---

## 3. Phase 3: Consensus Knowledge Space $K^*$ & Convergence

The dialogue achieved epistemic convergence:
$$\delta = d\left(K^{(2)}, K^{(1)}\right) < \epsilon$$
All open questions (`REQ-L2-01`, `REQ-L2-02`) are fully resolved without ambiguities.

### Key Consensus Tenets in $K^*$:
1. **Mathematical Scoring:** $\text{VVS} = 0.5 \cdot V_{1\text{h}} + 0.35 \cdot V_{6\text{h}} + 0.15 \cdot V_{24\text{h}}$, bounded in $[0.0..100.0]$.
2. **Entity-Specific Guardrails:** Differentiated thresholds applied prior to scoring.
3. **Architecture:** In-memory TTL rolling store + pure functional scoring engine + native Node.js HTTP router.
4. **Living Documentation:** BDD Gherkin scenarios serving as direct acceptance test criteria.

---

## 4. Phase 4 & 5: Artifact Transition
* The synthesized consensus $K^*$ is formally codified into:
  * `TrendTok Analytics/spec/srs.md` (SRS standard IEEE 830 / ISO 29148);
  * `TrendTok Analytics/spec/traceability_matrix.md` (Bidirectional Requirements Traceability Matrix);
  * Implementation in `src/trendScorer.js` and test validation in `tests/trendScorer.test.js`.

---

# SKED Dialogue Protocol & Session Log (Session #3)

**Session Identifier:** `SKED-SESSION-03`  
**Target Repository:** `TrendTok Analytics`  
**Date:** 2026-09-24  
**Participants:**
* **Human-Initiator ($H$):** Lysak Kostiantyn (IV course, Group KN-32)
* **AI Spec Analyst ($M$):** Google Antigravity (Gemini 3.8 Flash High)
**Methodology:** Socratic Knowledge Elicitation & Documentation (SKED)  
**Status:** Converged ($\delta < \epsilon$) & Approved  

---

## 1. Phase 1: Initialization & Maieutic Critique

* **Critique by Human ($H$):**
  * Current dataset of 5-6 sample items is statistically unrepresentative for TikTok virality analysis.
  * Real-world TikTok virality requires thousands of tracks: from brand-new, just-uploaded audio (testing early detection and noise filtering) to global viral explosions.
  * Need persistent database storage with multi-tier time granularity (1h, 6h, 24h changes) and rolling 7-day retention.
  * Music and hashtags must have direct clickable deep-links to official TikTok pages.
  * Main dashboard must provide category metric filters, switchable pagination (25 / 50 / 100 tracks per page), and an individual deep-dive inspection page.

---

## 2. Phase 2: Dialectic Architectural Choices

| Architectural Problem | Considered Options | Consensus Decision ($K^*$) |
|---|---|---|
| **Persistence Engine** | A: Native `node:sqlite`<br>B: JSON Lines flat files<br>C: PostgreSQL / Redis | **Option A (Native `node:sqlite`)**: Built directly into Node.js v24 runtime with zero external dependencies, persistent disk storage (`data/trendtok.db`), high-speed indexed SQL queries, and zero daemon setup. |
| **Data Scope & Scale** | A: Only top-100 official chart<br>B: 1,000 – 2,500+ broad corpus across all lifecycle stages | **Option B (1,000 – 2,500+ Corpus)**: Combines real TikTok Creative Center anchor items with a scaled Power-Law distribution generator spanning Just Uploaded (noise floor) to Viral hits. |
| **Multi-Tier History** | A: Flat single-point delta<br>B: Multi-window schema (1h, 6h, 24h, 7d retention) | **Option B**: SQLite schema supporting rolling 1h, 6h, and 24h delta metrics with 7-day retention window and automated periodic pruning. |
| **Deep-Linking** | A: Raw string IDs<br>B: Direct `tiktok.com` links | **Option B**: Automatic generation of `https://www.tiktok.com/music/-${soundId}` (or search URL) and `https://www.tiktok.com/tag/${cleanTag}` with `target="_blank"`. |
| **UI Scalability** | A: Single infinite DOM table<br>B: Switchable pagination (25/50/100) + Deep-Dive Inspector | **Option B**: Scalable UI with pagination controls (25, 50, 100), category metric tabs (Rapid 1h, 6h Breakout, 24h Sustained, Just Uploaded), and full telemetry inspector drawer. |

---

## 3. Phase 3: Consensus Knowledge Space $K^*$

The dialogue achieved complete epistemic convergence:
$$\delta = d(K^{(3)}, K^{(2)}) < \epsilon$$

### Codified Requirements:
* **`REQ-FR-12`**: Native `node:sqlite` Multi-Tier Persistence with 7-Day Rolling Retention.
* **`REQ-FR-13`**: High-Scale Corpus Ingestion (1,000 – 2,500+ items across all lifecycle stages).
* **`REQ-FR-14`**: TikTok Deep-Linking Architecture for Sounds and Hashtags.
* **`REQ-FR-15`**: Scalable Dashboard with 25/50/100 Pagination, Category Metric Tabs, and Deep-Dive Inspection View.

