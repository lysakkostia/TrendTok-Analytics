# TrendTok Analytics — SDD GitHub Kanban Board

| Issue ID | Type | Title | Role | Dependencies | Critical Path |
|---|---|---|---|---|:---:|
| **TT-SPEC-01** | `type:spec` | [SPEC] TT-SPEC-01: Baseline SRS, Glossary & BDD Acceptance Scenarios | `role:collaborative` | `Dependencies:** None (Kickoff artifact)` | **YES** |
| **TT-GATE-01** | `type:gate` | [GATE] TT-GATE-01: SPEC-GATE-01 Baseline Verification & Freeze | `role:human` | `Dependencies:** Blocked by `TT-SPEC-01`` | **YES** |
| **TT-TEST-01** | `type:test` | [TEST] TT-TEST-01: Ingestion REST Contract Suite (POST /api/snapshots) | `role:agent` | `Dependencies:** Blocked by `TT-GATE-01`` | **No** |
| **TT-FEAT-01** | `type:feature` | [FEAT] TT-FEAT-01: Ingestion HTTP Controller with Schema Validation | `role:agent` | `Dependencies:** Blocked by `TT-TEST-01`` | **No** |
| **TT-TEST-02** | `type:test` | [TEST] TT-TEST-02: Differentiated Noise Guardrail Test Suite | `role:agent` | `Dependencies:** Blocked by `TT-GATE-01`` | **YES** |
| **TT-FEAT-02** | `type:feature` | [FEAT] TT-FEAT-02: Pure Algorithmic Noise Guardrail Logic | `role:agent` | `Dependencies:** Blocked by `TT-TEST-02`` | **YES** |
| **TT-TEST-03** | `type:test` | [TEST] TT-TEST-03: Multi-Window Velocity & VVS Composite Calculus Tests | `role:agent` | `Dependencies:** Blocked by `TT-GATE-01`` | **YES** |
| **TT-FEAT-03** | `type:feature` | [FEAT] TT-FEAT-03: Mathematical Engine calculateMultiWindowVVS | `role:agent` | `Dependencies:** Blocked by `TT-TEST-03`` | **YES** |
| **TT-TEST-04** | `type:test` | [TEST] TT-TEST-04: Trend Lifecycle State Machine Transition Tests | `role:agent` | `Dependencies:** Blocked by `TT-FEAT-02`, `TT-FEAT-03`` | **YES** |
| **TT-FEAT-04** | `type:feature` | [FEAT] TT-FEAT-04: State Machine Evaluator determineLifecycleStatus | `role:agent` | `Dependencies:** Blocked by `TT-TEST-04`` | **YES** |
| **TT-TEST-05** | `type:test` | [TEST] TT-TEST-05: Emerging Leaderboard & Correlation Query Tests | `role:agent` | `Dependencies:** Blocked by `TT-GATE-01`` | **No** |
| **TT-FEAT-05** | `type:feature` | [FEAT] TT-FEAT-05: HTTP Query Endpoints (/emerging, /correlations) | `role:agent` | `Dependencies:** Blocked by `TT-TEST-05`` | **No** |
| **TT-TEST-06** | `type:test` | [TEST] TT-TEST-06: Golden Set Simulation Loader & 24h Buffer TTL Tests | `role:agent` | `Dependencies:** Blocked by `TT-GATE-01`` | **No** |
| **TT-FEAT-06** | `type:feature` | [FEAT] TT-FEAT-06: In-Memory Ring Buffer Store & Seed Generator | `role:agent` | `Dependencies:** Blocked by `TT-TEST-06`` | **No** |
| **TT-VERIF-01** | `type:verification` | [VERIF] TT-VERIF-01: Automated Test Suite Run & Latency Benchmark | `role:agent` | `Dependencies:** Blocked by `TT-FEAT-01..06`` | **YES** |
| **TT-VALID-01** | `type:validation` | [VALID] TT-VALID-01: Creator Domain Validation on Real TikTok Scenarios | `role:human` | `Dependencies:** Blocked by `TT-VERIF-01`` | **YES** |
| **TT-DOC-01** | `type:documentation` | [DOC] TT-DOC-01: Bidirectional RTM Updates & Execution Guides | `role:collaborative` | `Dependencies:** Blocked by `TT-VERIF-01`` | **No** |
| **TT-GATE-02** | `type:gate` | [GATE] TT-GATE-02: Checkpoint PLAN-GATE-01 / MVP-GATE Approval | `role:human` | `Dependencies:** Blocked by `TT-VALID-01`, `TT-DOC-01`` | **YES** |
| **TT-ADD-01** | `type:addendum` | [ADD] TT-ADD-01: Web Dashboard UI & Time-Step Simulation Controller | `role:collaborative` | `Dependencies:** Blocked by `TT-GATE-02`` | **No** |
| **TT-ADD-02** | `type:addendum` | [ADD] TT-ADD-02: Live Feed Ingestion Engine & Saturation Calculus | `role:collaborative` | `Dependencies:** Blocked by `TT-ADD-01`` | **No** |
| **TT-ADD-03** | `type:addendum` | [ADD] TT-ADD-03: Native SQLite Store, High-Scale Corpus & Deep-Links | `role:collaborative` | `Dependencies:** Blocked by `TT-ADD-02`` | **No** |
| **TT-GATE-03** | `type:gate` | [GATE] TT-GATE-03: SCALE-SQLITE-GATE-01 Audit Decision | `role:human` | `Dependencies:** Blocked by `TT-ADD-03`` | **No** |
| **TT-ADD-04** | `type:addendum` | [ADD] TT-ADD-04: Chrome CDP Agent, Dual Forecasting & Triad Engine | `role:collaborative` | `Dependencies:** Blocked by `TT-ADD-03`` | **No** |
