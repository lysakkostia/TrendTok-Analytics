---
name: sdd-workflow
description: >-
  Use this skill when developing new features, creating or updating specifications in /spec,
  validating compliance between code and specifications, or resolving SDD gate conflicts.
---

# SDD Workflow Skill for TrendTok Analytics

This skill instructs the agent on how to execute changes following the **Specification-Driven Development (SDD)** paradigm.

---

## 1. The SDD Lifecycle Loop

Every feature, module, or metric modification must strictly follow these four phases in order:

```
[ Phase 1: SPEC ] ──▶ [ Phase 2: TEST ] ──▶ [ Phase 3: CODE ] ──▶ [ Phase 4: GATE ]
  (/spec/*.md)          (/tests/*.test.js)      (/src/*.js)             (/logs/git_gate_*.md)
```

### Phase 1: Specification (`/spec`)
1. Review existing documents in `spec/` (e.g., `spec/system_concept.md`).
2. If introducing new functionality or changing algorithm formulas, update or create the corresponding spec document first.
3. Commit with semantic prefix: `spec: <description>`.

### Phase 2: Test Definition (`/tests`)
1. Write unit tests under `tests/` that encode the expected behavior defined in the specification.
2. Ensure test cases cover both expected normal operations and edge cases (e.g., micro-samples, division by zero, invalid payloads).
3. Commit with semantic prefix: `test: <description>`.

### Phase 3: Implementation (`/src`)
1. Implement the minimal clean code in `src/` needed to satisfy the tests.
2. Adhere strictly to project code style: Node.js ES Modules (`import`/`export`), JSDoc comments, camelCase naming, pure calculation functions.
3. Verify by running:
   ```bash
   node --test tests/**/*.test.js
   ```
4. Commit with semantic prefix: `feat: <description>`.

### Phase 4: Gate Checkpoint & Conflict Resolution (`/logs`)
1. When merging branches or encountering conflicts:
   * Evaluate competing changes exclusively against `/spec`.
   * Never resolve based on author role (human vs agent) or commit timestamps.
   * If an ambiguity in requirements is discovered, log it in the spec under "Open Issues" and record the decision in `logs/git_gate_decision.md`.
2. Commit with semantic prefix: `gate: <description>`.
