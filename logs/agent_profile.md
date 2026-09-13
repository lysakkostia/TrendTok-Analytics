# Coding Agent Profile & Operating Parameters

**Artifact Category:** SDD Interaction Log (`/logs`)  
**Project:** TrendTok Analytics  
**Date of Record:** 2026-09-13  
**Status:** Active  

---

## 1. Identification and Tool Classification

* **Agent Name:** Google Antigravity Coding Agent
* **Core Foundation Model:** Gemini 3.8 Flash (High) / Gemini 3.8 Pro
* **Tool Class:** Autonomous Agentic AI Assistant & Pair Programmer
* **System Role in Project:** Automated development partner operating under the Specification-Driven Development (SDD) methodology. The agent performs specification validation, code synthesis, test authoring, directory scaffolding, and automated Git lifecycle operations for a Node.js web application.

---

## 2. Workspace Access Model

* **Filesystem Access:**
  * Direct read and write capabilities across the local project directory tree (`s:\KPI\4курс\ПІС\TrendTok Analytics`).
  * Capability to inspect, edit, rename, and create project files and directories.
* **Terminal and Execution Environment:**
  * Execution of system commands via local Windows PowerShell shell interface.
  * Authority to execute Git CLI commands (`git status`, `git add`, `git commit`, `git branch`, `git merge`, etc.).
  * Authority to invoke Node.js runtime and npm toolchains (`node`, `npm`, `node --test`).
* **Network & Information Access:**
  * Real-time web retrieval for technical documentation and standards.
  * Isolated subagent delegation for research and code verification tasks.

---

## 3. Allowed and Automated Operations

Within the project workspace, the agent is configured to perform:

1. **Specification Analysis and Scaffolding**:
   * Interpreting natural language requirements and translating them into formal SDD specifications (`/spec`).
   * Maintaining consistency between `/spec` and implementation files (`/src`).
2. **Source Code & Test Synthesis**:
   * Authoring modular, tested Node.js/JavaScript ES modules adhering to clean architecture.
   * Developing unit and integration test fixtures using native `node:test` and `node:assert`.
3. **Version Control Management**:
   * Staging files and creating semantic commits following the SDD commit convention (`spec:`, `test:`, `feat:`, `docs:`, `gate:`).
   * Creating feature and experimental branches.
   * Detecting, analyzing, and resolving merge conflicts using specifications as the authoritative baseline.
4. **Audit and Gate Logging**:
   * Recording decisions and rationales in `/logs` for traceability across the SDD lifecycle.

---

## 4. SDD Operational Constraints & Human Oversight

* **Human-in-the-Loop Authority**: The agent operates under supervisory approval from the human software engineer (`Kiziaka05`). Critical milestones (such as repository initialization commits, architectural shifts, and schema changes) require review.
* **Specification as Single Source of Truth**: The agent is strictly prohibited from altering business logic or introducing features that contradict approved artifacts in `/spec`.
* **Conflict Resolution Standard**: During merge conflicts with human changes, resolution is governed strictly by alignment with approved specification artifacts, never by timestamp recency or agent vs. human seniority.
