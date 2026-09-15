# Software Requirements Specification (SRS)
## TrendTok Analytics — Real-Time Viral Content Intelligence Web Service

**Document Identifier:** `SRS-TRENDTOK-2026-V2`  
**Document Version:** `2.0.0`  
**Document Status:** Approved Baseline (SDD Phase 2 / Post-SKED Convergence)  
**Standard Compliance:** IEEE Std 830-1998 / ISO/IEC/IEEE 29148:2018  
**Repository Path:** `TrendTok Analytics/spec/srs.md`  
**Author:** Lysak Kostiantyn (Group KN-42) & Antigravity AI (Spec Analyst)  
**Date:** 2026-09-15  

---

## 1. Introduction

### 1.1 Purpose
This Software Requirements Specification (SRS) establishes the authoritative, normative specification for **TrendTok Analytics**: a high-throughput, asynchronous web service designed to monitor, ingest, evaluate, and forecast emerging viral trends across TikTok (audio tracks, hashtags, and format combinations). This document serves as the **Single Source of Truth (SSOT)** for subsequent construction, acceptance testing, and agentic code synthesis within the Specification-Driven Development (SDD) framework.

### 1.2 Scope & Non-Goals
#### In-Scope (Phase 2 Baseline):
1. Ingestion of discrete metric snapshots (`MetricSnapshot`) for audio sounds (`sound`) and hashtags (`hashtag`) via asynchronous batch REST endpoints (`POST /api/snapshots`).
2. High-performance, deterministic computation of normalized **Virality Velocity Score (VVS)** across composite sliding time windows (1-hour, 6-hour, and 24-hour).
3. Entity-differentiated statistical noise suppression (*Noise Guardrails*) to prevent micro-sample distortions.
4. Five-stage Trend Lifecycle State Machine tracking (`NOISE`, `EMERGING`, `VIRAL`, `SATURATED`, `DECAYING`).
5. Querying and leaderboard ranking REST endpoints (`GET /api/trends`, `GET /api/trends/emerging`, `GET /api/trends/:id`, `GET /api/trends/:id/correlations`).
6. Built-in deterministic simulation seed loader (`POST /api/simulation/seed`) for reproducible golden test verification.

#### Out-of-Scope (Deferred to Phase 3):
1. Live automated scraping against TikTok production endpoints (bypassing CAPTCHAs, bot protection).
2. Distributed message brokers (Apache Kafka, RabbitMQ) — in-memory circular buffer suffices for current throughput constraints.
3. User authentication, OAuth2 login, and multi-tenant billing tiers.

### 1.3 Definitions, Acronyms, and Ubiquitous Language
To eliminate semantic divergence between human developers, testing suites, and AI coding agents, all components must adhere strictly to the following **Ubiquitous Language**:

| Term | Category | Definition |
|---|---|---|
| **`TrendItem`** | Entity | A monitored platform artifact with an immutable `id`, `title`, and `type` (`sound` or `hashtag`). |
| **`MetricSnapshot`** | Value Object | A timestamped record containing cumulative `viewCount`, `videoCount`, and optional engagement metrics at point $t$. |
| **`SlidingWindow`** | Domain Concept | A discrete retrospective time delta ($\Delta t \in \{1\text{h}, 6\text{h}, 24\text{h}\}$) used to compute rate-of-change. |
| **`VideoVelocity`** ($V$) | Metric | First derivative of video creations over elapsed time: $V = \frac{\Delta \text{videoCount}}{\Delta t\text{ [hours]}}$. |
| **`ViralityVelocityScore`** ($\text{VVS}$) | Metric | Composite normalized score $\in [0.0..100.0]$ derived from weighted velocities across 1h, 6h, and 24h windows. |
| **`NoiseGuardrail`** | Policy | Validation boundary enforcing minimum cumulative views and video creation delta before scoring eligibility. |
| **`TrendLifecycleStatus`** | State Enum | Discrete stage of virality: `NOISE`, `EMERGING`, `VIRAL`, `SATURATED`, `DECAYING`. |
| **`GoldenSet`** | Test Artifact | Predefined, deterministic series of snapshots used as an oracle to assert calculation accuracy. |

---

## 2. Overall Description

### 2.1 Product Perspective
TrendTok Analytics operates as a standalone analytical microservice within the media monitoring ecosystem. It ingests raw or simulated metric feeds, processes time-series derivatives in memory, and exposes queryable REST APIs for front-end dashboards, automated SMM alert bots, and market intelligence consumers.

```
[ Ingestion Feeds / Seed Simulator ]
              │
              ▼  (HTTP POST /api/snapshots)
┌─────────────────────────────────────────────────────────┐
│ TrendTok Analytics Service (Node.js ES Modules)         │
│                                                         │
│  ┌───────────────────────┐   ┌────────────────────────┐ │
│  │ Ingestion & Validator │──▶│ In-Memory TTL Storage  │ │
│  └───────────────────────┘   │ (24-Hour Circular Ring)│ │
│                                  └───────────┬────────┘ │
│                                              ▼          │
│  ┌───────────────────────┐   ┌────────────────────────┐ │
│  │ REST Query Handlers   │◀──│ Pure TrendScorer Engine│ │
│  │ (Node native HTTP)    │   │ (Noise & VVS Calculus) │ │
│  └───────────────────────┘   └────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
              │
              ▼  (HTTP GET /api/trends/...)
[ Web Dashboards / SMM Alerts / API Clients ]
```

### 2.2 User Classes and Characteristics
1. **SMM Strategist**: Requires rapid querying of `EMERGING` audio tracks to capitalize on early meme cycles before saturation.
2. **Acceptance Test Runner / AI Agent**: Ingests automated test snapshots and verifies scoring outputs against formal contract criteria.
3. **Operations Engineer**: Monitors service health via `GET /api/health` and verifies memory buffer stability.

### 2.3 Design Constraints & Technology Standards
* **Runtime**: Node.js v24+ with strict ECMAScript Modules (`"type": "module"`).
* **Dependency Minimization**: Zero bulky external computation frameworks. Core analytics implemented as side-effect-free pure functions.
* **Testing**: Native Node.js test runner (`node:test`, `node:assert/strict`).
* **Persistence**: Pure in-memory sliding window cache with 24-hour time-to-live (TTL) pruning.

---

## 3. Specific System Requirements

### 3.1 Functional Requirements

#### REQ-FR-01: Discrete Metric Snapshot Ingestion
* **Description**: The system shall accept single or batched snapshot payloads representing observations of a `TrendItem` at a given ISO-8601 timestamp.
* **Endpoint**: `POST /api/snapshots`
* **Acceptance Criteria**:
  1. Payload must validate against the `MetricSnapshot` schema. Missing `itemId`, negative view/video counts, or malformed timestamps must return HTTP 400 Bad Request with a structured error response.
  2. Ingested snapshots must be appended to the item's in-memory historical timeline sorted chronologically.
  3. The endpoint must return HTTP 201 Created with ingested record count within 50 ms.

#### REQ-FR-02: Differentiated Noise Suppression (Resolving REQ-L2-01)
* **Description**: The system must apply entity-type-specific threshold guardrails prior to calculating virality metrics.
* **Acceptance Criteria**:
  1. For `type === 'sound'`: If `totalViews < 15,000` OR `deltaVideos_1h < 30`, the system must assign `viralityVelocityScore = 0.0` and set status to `NOISE`.
  2. For `type === 'hashtag'`: If `totalViews < 25,000` OR `deltaVideos_1h < 100`, the system must assign `viralityVelocityScore = 0.0` and set status to `NOISE`.
  3. Items meeting or exceeding thresholds must be forwarded to the active scoring pipeline.

#### REQ-FR-03: Multi-Window Virality Velocity Scoring (Resolving REQ-L2-02)
* **Description**: The system shall compute a composite Virality Velocity Score ($\text{VVS}$) normalized to the range $[0.0..100.0]$ using weighted sliding windows.
* **Mathematical Contract**:
  $$\text{VVS} = \min\left(100.0, \; 0.50 \cdot V_{1\text{h}} + 0.35 \cdot V_{6\text{h}} + 0.15 \cdot V_{24\text{h}}\right)$$
  where each window velocity $V_{\Delta t}$ is normalized by the canonical ceiling parameter ($K_{\text{norm}}(\text{sound}) = 200.0\text{ videos/hr}, K_{\text{norm}}(\text{hashtag}) = 500.0\text{ videos/hr}$).
* **Acceptance Criteria**:
  1. When historical snapshots for 6h or 24h are not yet accumulated, the engine must gracefully fall back to available window weights proportionally normalized to sum to 1.0.
  2. Calculation must be deterministic and executed via pure functions in `src/trendScorer.js`.

#### REQ-FR-04: Trend Lifecycle State Machine Transition
* **Description**: The system shall dynamically transition each `TrendItem` across lifecycle states based on current $\text{VVS}$ and acceleration $a = \frac{dV}{dt}$.
* **State Criteria**:
  * `NOISE`: Fails Noise Guardrail criteria.
  * `EMERGING`: Passes Noise Guardrail, $\text{VVS} \ge 50.0$, and acceleration $a > 0$ (rising trajectory).
  * `VIRAL`: $\text{VVS} \ge 80.0$ (sustained exponential adoption).
  * `SATURATED`: High cumulative views, but acceleration $a \le 0$ and $\text{VVS} < 80.0$.
  * `DECAYING`: $V_{1\text{h}} < 5.0$ and negative growth over consecutive observations.

#### REQ-FR-05: Emerging Trends Leaderboard Querying
* **Description**: The system shall provide an endpoint returning exclusively items currently in the `EMERGING` state, ordered by descending $\text{VVS}$.
* **Endpoint**: `GET /api/trends/emerging`
* **Acceptance Criteria**:
  1. Response must return JSON array of `TrendItemSummary` objects.
  2. Items with status other than `EMERGING` must be strictly excluded.
  3. Response latency must not exceed 25 ms for up to 1,000 tracked items.

#### REQ-FR-06: Sound and Hashtag Cross-Correlation
* **Description**: The system shall support identifying co-occurring hashtags for a given sound track.
* **Endpoint**: `GET /api/trends/:id/correlations`
* **Acceptance Criteria**:
  1. If `:id` belongs to a sound, returns an array of associated hashtag IDs with their co-occurrence frequency and velocity index.
  2. If no correlations exist, returns an empty array with HTTP 200 OK.

#### REQ-FR-07: Deterministic Golden Set Simulation Loader
* **Description**: The system shall provide an endpoint to seed or advance simulated snapshots for testing and demonstration purposes.
* **Endpoint**: `POST /api/simulation/seed`
* **Acceptance Criteria**:
  1. Clears current volatile state and populates the in-memory store with the canonical Golden Set (5 sounds, 5 hashtags across 24 hourly snapshots).
  2. Returns HTTP 200 OK with confirmation summary.

---

### 3.2 Non-Functional Requirements (NFR)

#### REQ-NFR-01: Low Latency & High Throughput
* Single calculation of $\text{VVS}$ for an individual item must execute in under 0.5 milliseconds.
* End-to-end API response time for read endpoints must maintain $P_{99} < 30\text{ ms}$.

#### REQ-NFR-02: Memory Footprint & Retention Pruning
* The in-memory store must enforce an automated rolling TTL pruning policy: snapshots with timestamps older than $T_{\text{current}} - 26\text{ hours}$ must be discarded automatically.
* Total memory usage under 5,000 tracked items must remain under 128 MB.

#### REQ-NFR-03: Robustness & Fail-Fast Input Validation
* The system must never crash on malformed JSON, division by zero, or negative numbers. All errors must result in standardized JSON error schemas:
  `{ "error": "VALIDATION_ERROR", "message": "...", "timestamp": "..." }`.

#### REQ-NFR-04: Testability & 100% Contract Traceability
* Every requirement clause (`REQ-FR-01` through `REQ-FR-07`) must map to at least one automated test in `tests/` and an entry in `spec/traceability_matrix.md`.

---

## 4. Appendices & Formal Addenda

### Addendum A: Mathematical Formulation of Virality Velocity Score (VVS)

Let $\mathcal{S} = \{s_0, s_1, \dots, s_n\}$ be chronologically ordered snapshots of item $i$.  
For window duration $\Delta t \in \{1, 6, 24\}$ hours:

$$\Delta \text{videos}_{\Delta t} = \text{videoCount}(t) - \text{videoCount}(t - \Delta t)$$

Raw hourly velocity:
$$v_{\Delta t} = \frac{\max(0, \Delta \text{videos}_{\Delta t})}{\Delta t}$$

Normalized window velocity index $V_{\Delta t} \in [0..100]$:
$$V_{\Delta t} = \min\left(100.0, \; \frac{v_{\Delta t}}{K_{\text{norm}}(\text{type})} \times 100.0\right)$$

where scaling normalizer:
$$K_{\text{norm}}(\text{sound}) = 200.0 \text{ new videos/hr}, \quad K_{\text{norm}}(\text{hashtag}) = 500.0 \text{ new videos/hr}$$

Composite Weighted Virality Velocity Score:
$$\text{VVS} = 0.50 \cdot V_{1\text{h}} + 0.35 \cdot V_{6\text{h}} + 0.15 \cdot V_{24\text{h}}$$

### Addendum B: Trend Lifecycle State Transition Matrix

| Initial State | Condition Trigger | Destination State | Action |
|---|---|---|---|
| `*` | Views/Videos fail type-specific Noise Guardrail | `NOISE` | $\text{VVS} \leftarrow 0.0$ |
| `NOISE` | Passes Guardrail AND $\text{VVS} \ge 50$ AND $a > 0$ | `EMERGING` | Broadcast emerging trend event |
| `EMERGING` | $\text{VVS} \ge 80$ | `VIRAL` | Flag as peak viral trend |
| `VIRAL` | Acceleration $a \le 0$ AND $\text{VVS} < 80$ | `SATURATED` | Deprecate from emerging leaderboard |
| `SATURATED` | $v_{1\text{h}} < 5.0$ over 3 consecutive cycles | `DECAYING` | Mark for low-frequency monitoring |

### Addendum C: BDD Acceptance Scenarios (Gherkin Living Documentation)

#### Scenario BDD-01: Sound Early Virality Detection (EMERGING)
```gherkin
Feature: Sound Virality Classification
  Scenario: Rapid adoption elevates novel sound to EMERGING status
    Given a sound item "aurora_echoes" with totalViews = 35000
    And snapshot 1 hour ago reported 120 videos
    When current snapshot reports 360 videos created (delta = 240)
    Then the Noise Guardrail check for "sound" succeeds (views >= 15k, delta >= 30)
    And the 1-hour velocity is calculated as 240 videos/hour
    And the calculated VVS is 60.0
    And the trend lifecycle status transitions to "EMERGING"
```

#### Scenario BDD-02: Hashtag Noise Floor Suppression (NOISE)
```gherkin
Feature: Hashtag Noise Guardrail
  Scenario: Low-volume hashtag is suppressed despite percentage jump
    Given a hashtag item "#cozyhomevibes" with totalViews = 12000
    When snapshot reports 60 new videos created in the past hour
    Then the Noise Guardrail check for "hashtag" fails (requires views >= 25k and delta >= 100)
    And the ViralityVelocityScore must equal 0.0
    And the trend lifecycle status remains "NOISE"
```

#### Scenario BDD-03: Viral Saturation Transition (SATURATED)
```gherkin
Feature: Saturation Detection
  Scenario: Decelerating viral item transitions to SATURATED
    Given a sound item "viral_groove" previously in "VIRAL" status
    And peak historical velocity V_peak = 90.0
    When recent hourly snapshots show velocity declining to 65.0 (acceleration a < 0)
    Then the trend lifecycle status transitions to "SATURATED"
    And the item is excluded from the "EMERGING" leaderboard query
```
