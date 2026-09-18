# Software Requirements Specification (SRS)
## TrendTok Analytics — Real-Time Viral Content Intelligence Web Service

**Document Identifier:** `SRS-TRENDTOK-2026-V2`  
**Document Version:** `2.0.0`  
**Document Status:** Approved Baseline (SDD Phase 2 / Post-SKED Convergence)  
**Standard Compliance:** IEEE Std 830-1998 / ISO/IEC/IEEE 29148:2018  
**Repository Path:** `TrendTok Analytics/spec/srs.md`  
**Author:** Lysak Kostiantyn (Group KN-32) & Antigravity AI (Spec Analyst)  
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

### 1.4 Specification-Driven Development (SDD) Protocol & Operational Workflow

This specification is designed for autonomous ingestion by both human engineers and AI coding agents. To guarantee full reproducibility of the system purely from this specification within an LLM context window, development must adhere strictly to the **Specification-Driven Development (SDD)** lifecycle:

```
[ Phase 1: SPEC ] ──▶ [ Phase 2: TEST ] ──▶ [ Phase 3: CODE ] ──▶ [ Phase 4: GATE ]
  (/spec/*.md)          (/tests/*.test.js)      (/src/*.js)             (/logs/*_gate_*.md)
```

1. **Phase 1: Specification (`/spec`)**:
   * The specification is the **Single Source of Truth (SSOT)**.
   * No production code or tests may be synthesized without an explicit, approved requirement clause (`REQ-FR-*` or `REQ-NFR-*`).
   * The agent is strictly prohibited from inventing tacit business logic or unconstrained formulas.
2. **Phase 2: Test Definition (`/tests`)**:
   * Test-First Principle: Before modifying or adding code in `src/`, automated tests encoding the specification clauses must be authored in `tests/`.
   * Tests must cover standard operating paths as well as edge cases (division by zero, missing snapshots, negative counts).
3. **Phase 3: Implementation (`/src`)**:
   * Code in `src/` must be the minimal, pure, deterministic implementation necessary to satisfy the tests.
   * Strict adherence to project architecture: Node.js ES Modules, pure algorithmic functions, zero heavyweight runtime dependencies.
4. **Phase 4: Gate Audit & Verification (`/logs`)**:
   * Prior to merging, the full suite must pass (`node --test tests/**/*.test.js`).
   * Conflicts are audited against `/spec` and documented in `/logs/*_gate_decision.md`.

#### Repository Directory Taxonomy:
* `/spec` — Authoritative requirements, domain glossary (`glossary.md`), mathematical models, and Requirements Traceability Matrix (`traceability_matrix.md`).
* `/src` — Production source code (`index.js` HTTP server, `trendScorer.js` analytical calculus).
* `/tests` — Automated verification suites executed by native Node test runner (`trendScorer.test.js`, `api.test.js`).
* `/logs` — Audit trail: SKED elicitation transcripts (`sked_session_log.md`), gate decisions (`spec_gate_decision.md`, `git_gate_decision.md`), and agent operational profiles (`agent_profile.md`).
* `/docs` — Supplementary architectural blueprints and guidelines.

#### Semantic Commit Message Convention:
Every Git commit must carry a semantic prefix identifying the affected SDD artifact:

| Prefix | Artifact Category | Purpose & Scope | Example |
|---|---|---|---|
| `spec:` | Requirements & Models | Modifications or baseline approvals in `/spec` | `spec: define multi-window VVS calculus in srs.md` |
| `test:` | Verification Suites | New or updated test fixtures and assertions in `/tests` | `test: add noise guardrail threshold unit tests` |
| `feat:` | Production Code | Functional implementations in `/src` | `feat: implement pure VVS trendScorer engine` |
| `gate:` | Quality Checkpoints | Formal gate audit records and conflict resolutions in `/logs` | `gate: approve SPEC-GATE-01 baseline specification` |
| `docs:` | Documentation | Guidelines, README, and course reports | `docs: update academic lab report structure` |
| `fix:` / `refactor:` | Defect Fixes / Code Clean | Non-functional refactoring or bugfixes | `refactor: clean up KaTeX math delimiters in spec` |

#### Git Branching Strategy:
* `main` — Authoritative branch containing validated specifications, green test suites, and audited code.
* `feat/*` or `agent/*` — Isolated branches for agentic synthesis and incremental feature development.
* `human/*` — Branches for human developer experiments and exploratory validation.

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

### 2.4 Agentic System Reproduction & Execution Directives
When an AI agent (e.g. Antigravity, Claude, or GPT) is initialized with only this SRS in its context, the agent must observe the following operational invariants:
1. **Context-Driven Autonomy**: All domain models, mathematical equations, validation thresholds, and API contracts are fully self-contained within Sections 3, 4, and Addenda of this document. No external or tacit knowledge is required.
2. **Deterministic Pure Calculus**: All scoring logic (`calculateViralityScore`, `calculateMultiWindowVVS`, `checkNoiseGuardrail`) must reside in `src/trendScorer.js` as pure functions without mutable globals or side effects.
3. **Fail-Fast Schema Guardrails**: Incoming payloads at `POST /api/snapshots` must validate `itemId`, `totalViews`, `totalVideos`, and timestamps before memory ingestion. Malformed requests must immediately return HTTP 400.
4. **Execution & Verification Protocol**:
   * Launch service: `node src/index.js`
   * Execute full verification suite: `node --test tests/**/*.test.js`

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
  $$\text{VVS} = \min\left(100.0, 0.50 \cdot V_{1\text{h}} + 0.35 \cdot V_{6\text{h}} + 0.15 \cdot V_{24\text{h}}\right)$$
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

Normalized window velocity index $V_{\Delta t} \in [0, 100]$:
$$V_{\Delta t} = \min\left(100.0, \frac{v_{\Delta t}}{K_{\text{norm}}(\text{type})} \times 100.0\right)$$

where scaling normalizer:
$$K_{\text{norm}}(\text{sound}) = 200.0\text{ new videos/hr}, \quad K_{\text{norm}}(\text{hashtag}) = 500.0\text{ new videos/hr}$$

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

### Addendum D: SDD Quality Gates & Conflict Resolution Protocol (SPEC-GATE / GIT-GATE)

#### D.1 Definition of Done (DoD)
A feature or requirement is formally considered DONE if and only if:
1. **100% Contract Traceability**: The requirement is mapped in `spec/traceability_matrix.md` with explicit links to tests and code symbols.
2. **Automated Verification**: Every acceptance criterion is validated by passing unit/integration tests (`node --test`).
3. **Purity & JSDoc**: Exported functions include comprehensive JSDoc annotations detailing parameter types and return contracts.
4. **Zero Regressions**: Running the entire test suite exhibits 0 failures and 0 skipped tests.

#### D.2 Gate Resolution Policy (Human vs. Agent Conflicts)
If a divergence occurs during branch merges or between human edits and agent-generated artifacts:
1. **Specification as Arbiter**: The approved specification in `spec/srs.md` (branch `main`) is the sole evaluation authority. Neither human nor AI edits receive preference based on author role or commit timestamps.
2. **Contract Alignment**: If one implementation complies with the mathematical contract in SRS and the other deviates, the compliant version is retained.
3. **Gap Handling**: If both implementations uncover an ambiguous edge case not covered by the SRS, the discrepancy is classified as an **Unresolved Requirement Gap** (`REQ-GAP-*`), temporarily frozen, and resolved via formal addendum during the next SKED iteration.
4. **Formal Gate Logging**: Every checkpoint decision must be documented in `/logs/git_gate_decision.md` or `/logs/spec_gate_decision.md`.

