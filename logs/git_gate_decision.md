# GIT-GATE Decision Record: Human-Agent Conflict Resolution

**Checkpoint Identifier:** `GIT-GATE-01`  
**Target Branch:** `main`  
**Source Branches:** `agent/velocity-scoring-algorithm` (Agent) & `human/threshold-scoring` (Human)  
**Date of Decision:** 2026-09-13  
**Evaluator:** Lead Engineer & SDD Protocol  
**Technology Stack:** Node.js (ES Modules)  
**Status:** Approved & Merged  

---

## 1. Conflict Context and Nature

During the implementation of the core scoring mechanism in `src/trendScorer.js` and accompanying tests in `tests/trendScorer.test.js`, two divergent implementations were introduced:

1. **Branch `agent/velocity-scoring-algorithm` (Coding Agent)**:
   * Computed the first derivative of video creations over a sliding window ($\Delta \text{videos} / \Delta \text{hours}$) normalized to $[0..100]$.
   * Justification: Directly derived from `spec/system_concept.md` Section 1 (*"identify viral trends at an emerging phase rather than after saturation"*) and Section 3.2 (*"computes trend velocity: the first derivative of engagement metrics over discrete sliding time windows"*).

2. **Branch `human/threshold-scoring` (Human Developer)**:
   * Utilized static cumulative view milestones ($\ge 1,000,000$ views $= 100$, $\ge 500,000$ views $= 50$).
   * Justification: Developer preference for computational simplicity and reliance on aggregate platform volume.

---

## 2. SDD Ground Truth Evaluation

According to SDD principles, merge conflicts **must not** be resolved based on author authority (human superiority) or chronological commit timestamps. The sole arbiter is alignment with approved specifications (`/spec`).

| Evaluation Criterion | Agent Implementation | Human Implementation | SDD Ruling |
|---|---|---|---|
| **Alignment with System Mission** (`spec` §1) | **Compliant**: Detects emerging trends during exponential growth phase. | **Non-compliant**: Favors already saturated, viral videos with high static views regardless of current growth. | Agent aligned with core goal. |
| **Adherence to Architecture** (`spec` §3.2) | **Compliant**: Explicitly implements velocity first derivative over time windows. | **Non-compliant**: Completely discards sliding time windows in favor of static counters. | Agent aligned with architecture. |
| **Noise Resilience on Small Samples** | Potential edge case: Low-volume items with rapid percentage growth could trigger false positives. | Implicitly avoids noise on small samples by enforcing high view minimums. | Human approach highlights an implicit requirement. |

---

## 3. Resolution Decision & Synthesis

1. **Primary Algorithm Adopted**: The velocity rate-of-change formulation from the agent's branch was adopted as the primary scoring mechanism, as it strictly fulfills the approved specification in `spec/system_concept.md`.
2. **Synthesized Improvement**: A baseline volume threshold guard was incorporated to filter out micro-sample anomalies ($< 1,000$ views with insignificant video creation), directly addressing the valid practical concern highlighted by the human developer's proposal.
3. **Traceability**: All changes were covered with updated unit tests in `tests/trendScorer.test.js` executed via Node.js native test runner (`node --test`).

---

## 4. Identified Specification Gap for Lab #2 (SKED Dialogue)

The conflict revealed that `spec/system_concept.md` lacks exact numerical parameters for noise suppression on nascent trends. This has been logged as an open requirement for Laboratory Work #2:
* **Requirement Issue #REQ-L2-01**: Define precise minimum view and video thresholds before a `TrendItem` enters the active velocity calculation pipeline.
* **Requirement Issue #REQ-L2-02**: Establish mathematical decay factors for older snapshots in multi-tier sliding time windows (1h, 6h, 24h).
