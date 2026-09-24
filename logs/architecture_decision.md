# ADR-04: Formal Architecture Description Baseline (ISO/IEC/IEEE 42010 & 4+1 View Model)

**Record Identifier:** `ADR-04`  
**Checkpoint Identifier:** `ARCH-GATE-01`  
**Status:** **APPROVED & BASELINED**  
**Date:** 2026-09-24  
**Evaluator:** Lysak Kostiantyn (Group KN-32) & Antigravity SDD Auditor  
**System:** TrendTok Analytics (v2.2.0)  

---

## 1. Context & Problem Statement

As TrendTok Analytics expanded to incorporate real-time external live feed ingestion (`REQ-FR-10`) and predictive trajectory saturation calculus (`REQ-FR-11`), a formal, standardized architecture description became necessary to:
1. Prevent architectural drift and maintain strict separation between the pure domain calculus and I/O infrastructure.
2. Formally document stakeholder concerns, viewpoints, and system boundaries according to international standards (**ISO/IEC/IEEE 42010:2011**, **IEEE 1471**, and **Kruchten's 4+1 View Model**).
3. Establish structural, behavioral, and state-machine blueprints for future expansions (e.g. persistent database storage or distributed message queues).

---

## 2. Considered Alternatives

| Option | Pros | Cons | Decision |
|---|---|---|---|
| **Option A: Informal README diagrams** | Quick to write. | Lacks formal ISO compliance; does not address multi-stakeholder viewpoints or mathematical formulations. | **REJECTED** |
| **Option B: Full Heavy Enterprise EA (TOGAF/ArchiMate)** | Highly exhaustive enterprise taxonomy. | Extreme ceremony, unsuitable for lightweight agile microservice SDD lifecycle. | **REJECTED** |
| **Option C: ISO/IEC/IEEE 42010 with C4 View Model & Mermaid Diagrams** | Globally recognized standard, clear view separation (Context, Container, Component, Dynamic, State), executable Mermaid diagrams within Git repository. | Requires rigorous discipline and complete traceability to SRS. | **ACCEPTED** |

---

## 3. Decision Outcome

We have adopted **Option C** and authored [`docs/architecture.md`](../docs/architecture.md) containing:
1. **System Context (Level 1)**: Defines system boundary with SMM creators, external TikTok feeds, and CI gate runners.
2. **Container Model (Level 2)**: Separates the Browser SPA, Node.js HTTP server, pure scoring calculus, in-memory circular ring buffer, and external feed adapters.
3. **Component View (Level 3)**: Details internal decoupling between routing, schema validation, adapter strategy, and pure algorithms.
4. **Behavioral Sequence Diagram**: Traces end-to-end ingestion flow from external TikTok HTTP fetch to dashboard opportunity rendering.
5. **State Machine Specification**: Formally models transitions across `INITIAL_DETECTION`, `NOISE`, `EMERGING`, `VIRAL`, and `SATURATED`.
6. **Mathematical Formulations**: Rigorously defines Multi-Window VVS and Saturation Horizon calculus.

---

## 4. Consequences & Compliance Verification

* **Positive**: The architecture provides unambiguous guidance for future iterations and academic evaluation.
* **Positive**: All diagrams are maintained directly in Markdown using standard Mermaid syntax, versioned under Git.
* **Compliance**: Validated against `spec/srs.md` (v2.2) and verified against `spec/traceability_matrix.md`.
