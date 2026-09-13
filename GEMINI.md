# TrendTok Analytics — Agent Context & Code Style Guidelines (GEMINI.md)

This document defines the mandatory project context, architectural principles, SDD rules, and code style conventions for AI coding agents and developers working on **TrendTok Analytics**.

---

## 1. Project Overview & Mission

* **Project Name**: TrendTok Analytics (TikTok Viral Content Analytics Web Service).
* **Domain**: Social media viral content intelligence and trend tracking.
* **Goal**: Automated ingestion, real-time scoring, predictive trajectory modeling, and visualization of TikTok trends (hashtags, sounds, video formats) before market saturation.
* **Methodology**: Specification-Driven Development (SDD).

---

## 2. SDD Core Principles & Repository Layout

The repository is the **Single Source of Truth** for all artifacts:

```text
TrendTok Analytics/
├── .agents/                # Custom skills, agents, and automation workflows
│   ├── skills/             # On-demand runbooks (sdd-workflow, trend-scorer-validation)
│   └── agents/             # Dedicated subagent profiles (spec-analyst, code-reviewer)
├── GEMINI.md               # Always-on project guidelines and conventions (this file)
├── spec/                   # Authoritative specifications (Single Source of Truth)
├── src/                    # Node.js source code (ES Modules)
├── tests/                  # Automated tests (node:test + node:assert)
├── docs/                   # Architectural & user documentation
└── logs/                   # Agent interaction logs & GIT-GATE decision records
```

### Critical SDD Rules:
1. **Spec as Ground Truth**: Implementation in `/src` and tests in `/tests` must directly trace to an approved document in `/spec`.
2. **Never Invent Undefined Logic**: If a business rule is missing or ambiguous in `/spec`, log it as an open question/issue in `/spec` or `/logs` rather than assuming behavior.
3. **Conflict Resolution (GATE)**: In any merge conflict between human and agent changes, decisions are made strictly based on alignment with `/spec`, never on author seniority or commit timestamps. All resolutions must be documented in `/logs/git_gate_decision.md`.

---

## 3. Technology Stack & Runtime Standards

* **Runtime**: Node.js (version 20+; active runtime is Node v24).
* **Module System**: ECMAScript Modules (`type: "module"` in `package.json`). Always use `import` / `export`. Never use `require()` or `module.exports`.
* **Testing Engine**: Built-in Node.js Test Runner (`node:test`, `node:assert/strict`). Run via `npm test` or `node --test tests/**/*.test.js`.
* **Web Framework**: Native Node.js HTTP server / Express / Fastify (lightweight, asynchronous).
* **Dependencies**: Minimize unnecessary external dependencies. Prioritize Node.js standard library (`node:http`, `node:url`, `node:crypto`, `node:fs/promises`, `node:test`).

---

## 4. Code Style & Quality Guidelines

### Formatting & Syntax
* **Indentation**: 2 spaces (no tabs).
* **Semicolons**: Always include semicolons.
* **Quotes**: Double quotes for JSON and markdown links; single or double quotes consistent within JavaScript files.
* **Naming Conventions**:
  * `camelCase`: Variables, object properties, functions, and module instances.
  * `PascalCase`: Classes and React/UI components.
  * `UPPER_SNAKE_CASE`: Global constants and configuration limits.
  * `kebab-case`: File names and directory names (e.g., `trendScorer.js` or `trend-scorer.js`, maintain consistency).

### Functions & Architecture
* **Pure Functions for Calculations**: Algorithms computing velocity, scores, or rankings must be pure, deterministic functions without side effects, accepting metric objects and returning numbers.
* **Async/Await**: Always use `async` / `await` for I/O operations (fetching, scraping, database queries). Never leave rejected promises unhandled.
* **JSDoc Documentation**: Every exported function must have full JSDoc annotations detailing parameter types, defaults, and return types:
  ```javascript
  /**
   * Calculate normalized Virality Velocity Score (VVS).
   * @param {Object} metrics
   * @param {number} metrics.new_videos_delta - Newly created videos in the window.
   * @param {number} [metrics.window_hours=1.0] - Window duration in hours.
   * @returns {number} Score normalized between 0.0 and 100.0.
   */
  ```
* **Guardrails & Edge Cases**: Always validate inputs against division by zero (e.g., `window_hours <= 0`), `NaN`, and micro-sample anomalies.

---

## 5. Git Commit Convention

All commits must use semantic SDD prefixes:

| Prefix | Artifact Category / Intended Action |
|---|---|
| `spec:` | Requirements, SRS, architecture specs, entity schemas in `/spec` |
| `test:` | Unit, integration, or e2e test cases in `/tests` |
| `feat:` | Production feature implementation or updates in `/src` |
| `docs:` | Documentation, README, guides in `/docs` or root |
| `gate:` | Formal gate resolutions and conflict settlements in `/logs` |
| `fix:`  | Defect fixes in code or tests |
| `refactor:` | Code reorganization without functional changes |

---

## 6. Pre-Commit Checklist for Agents

Before completing any task or proposing a commit:
1. Run `node --test tests/**/*.test.js` to ensure 100% passing tests.
2. Verify that any newly introduced code has corresponding test coverage.
3. Check that changes do not violate or contradict documents in `/spec`.
4. Ensure `git status` reflects only intended, clean modifications.
