#!/usr/bin/env node
/**
 * TrendTok Analytics — GitHub Issues & Project Board Synchronizer
 * 
 * Automates the creation of SDD labels and issues for TrendTok Analytics
 * via GitHub REST API (v3). Supports dry-run and token-based sync.
 * 
 * Usage:
 *   node scripts/sync-github-issues.js --dry-run
 *   node scripts/sync-github-issues.js --token <YOUR_GITHUB_PAT>
 *   $env:GITHUB_TOKEN="ghp_xxx"; node scripts/sync-github-issues.js
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_OWNER = 'lysakkostia';
const REPO_NAME = 'TrendTok-Analytics';
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

// Helper: load env file if token not in process.env
function loadEnvToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const candidatePaths = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../env_variable.env'),
    resolve(process.cwd(), 'env_variable.env')
  ];
  for (const p of candidatePaths) {
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, 'utf-8');
        const match = content.match(/GITHUB_TOKEN\s*=\s*([^\r\n#]+)/);
        if (match && match[1]) return match[1].trim();
      } catch {}
    }
  }
  return '';
}

// Parse CLI flags
const args = process.argv.slice(2);
let token = loadEnvToken();
let isDryRun = args.includes('--dry-run');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--token' && args[i + 1]) {
    token = args[i + 1];
  }
}

if (!token && !isDryRun) {
  console.log('ℹ No GITHUB_TOKEN provided. Defaulting to --dry-run mode.');
  console.log('To synchronize directly to GitHub, run:');
  console.log('  node scripts/sync-github-issues.js --token <YOUR_PAT_TOKEN>\n');
  isDryRun = true;
}

// 1. Label Taxonomy Definitions
const LABELS = [
  { name: 'type:spec', color: '5319e7', description: 'SDD Specification authoring or formal review' },
  { name: 'type:addendum', color: '1d76db', description: 'Formal scope addition to baseline SRS' },
  { name: 'type:test', color: 'fbca04', description: 'Automated test suite (Test-First SDD)' },
  { name: 'type:feature', color: '0e8a16', description: 'Algorithmic or system implementation' },
  { name: 'type:verification', color: '006b75', description: 'Automated test suite run and performance benchmark' },
  { name: 'type:validation', color: 'b60205', description: 'Human assessment of intent and creator UX' },
  { name: 'type:documentation', color: 'c2e0c6', description: 'Project architecture, manuals, RTM updates' },
  { name: 'type:gate', color: 'd93f0b', description: 'Independent stage-gate audit checkpoint (Go/Revise)' },
  { name: 'role:human', color: 'e99695', description: 'Assigned strictly to human architect' },
  { name: 'role:agent', color: 'c5def5', description: 'Assigned to coding agent (Antigravity)' },
  { name: 'role:collaborative', color: 'bfdadc', description: 'Co-developed by human and agent' },
  { name: 'status:blocked-by-gate', color: 'b60205', description: 'Execution paused awaiting Gate approval' },
  { name: 'critical-path', color: 'b60205', description: 'Task on the Critical Path (CPM)' }
];

// 2. Comprehensive SDD Ticket Registry
const TICKETS = [
  {
    id: 'TT-SPEC-01',
    title: '[SPEC] TT-SPEC-01: Baseline SRS, Glossary & BDD Acceptance Scenarios',
    labels: ['type:spec', 'role:collaborative', 'critical-path'],
    body: `### SDD Specification Baseline
- **Target Requirements:** \`REQ-FR-01\` through \`REQ-FR-07\`, \`REQ-NFR-01..03\`
- **Role:** Human Lead (Lysak Kostiantyn) + Coding Agent (Antigravity)
- **Dependencies:** None (Kickoff artifact)
- **Blocks:** \`TT-GATE-01\`
- **Estimated Duration:** Agent: 15 min | Human: 2.0 h

#### Objective
Establish frozen requirements baseline in \`spec/srs.md\` with mathematical formulas for Noise Guardrail and Multi-Window VVS.

#### Definition of Done
- [x] All 7 functional and 3 non-functional requirements uniquely identified.
- [x] Socratic SKED dialogue logged in \`logs/sked_session_log.md\`.
- [x] Glossary established in \`spec/glossary.md\`.`
  },
  {
    id: 'TT-GATE-01',
    title: '[GATE] TT-GATE-01: SPEC-GATE-01 Baseline Verification & Freeze',
    labels: ['type:gate', 'role:human', 'critical-path'],
    body: `### SDD Quality Gate Checkpoint
- **Target Requirements:** Entire Phase 1 Scope
- **Role:** Human Lead (Lysak Kostiantyn) — *Non-delegable*
- **Dependencies:** Blocked by \`TT-SPEC-01\`
- **Blocks:** \`TT-TEST-01\`, \`TT-TEST-02\`, \`TT-TEST-03\`, \`TT-TEST-05\`, \`TT-TEST-06\`
- **Estimated Duration:** Human: 1.0 h

#### Objective
Audit SRS for ambiguities, testability, and resolution of open issues (\`REQ-L2-01\`, \`REQ-L2-02\`).

#### Decision Criteria
- [x] Unambiguous differentiated noise thresholds.
- [x] Zero orphaned requirements in initial RTM.
- [x] Formal Gate Decision recorded in \`logs/spec_gate_decision.md\` with **PASS** verdict.`
  },
  {
    id: 'TT-TEST-01',
    title: '[TEST] TT-TEST-01: Ingestion REST Contract Suite (POST /api/snapshots)',
    labels: ['type:test', 'role:agent'],
    body: `### Test-First Specification
- **Target Requirement:** \`REQ-FR-01\`, \`REQ-NFR-03\`
- **Role:** Coding Agent
- **Dependencies:** Blocked by \`TT-GATE-01\`
- **Blocks:** \`TT-FEAT-01\`
- **Estimated Duration:** Agent: 5 min | Human review: 20 min

#### Acceptance Contract
- Validate JSON schema for \`MetricSnapshot\` (totalViews, totalVideos, timestamp).
- Assert HTTP 400 fail-fast on malformed or negative payloads.`
  },
  {
    id: 'TT-FEAT-01',
    title: '[FEAT] TT-FEAT-01: Ingestion HTTP Controller with Schema Validation',
    labels: ['type:feature', 'role:agent'],
    body: `### Feature Implementation
- **Target Requirement:** \`REQ-FR-01\`, \`REQ-NFR-03\`
- **Role:** Coding Agent
- **Dependencies:** Blocked by \`TT-TEST-01\`
- **Blocks:** \`TT-VERIF-01\`
- **Estimated Duration:** Agent: 10 min | Human review: 15 min

#### Objective
Implement \`handleIngestSnapshots\` in pure ESM \`src/index.js\`.`
  },
  {
    id: 'TT-TEST-02',
    title: '[TEST] TT-TEST-02: Differentiated Noise Guardrail Test Suite',
    labels: ['type:test', 'role:agent', 'critical-path'],
    body: `### Test-First Specification (High-Cost of Failure)
- **Target Requirement:** \`REQ-FR-02\`
- **Role:** Coding Agent
- **Dependencies:** Blocked by \`TT-GATE-01\`
- **Blocks:** \`TT-FEAT-02\`
- **Estimated Duration:** Agent: 5 min | Human review: 30 min

#### Boundary Assertions
- Sound: suppressed when views < 15,000 OR delta < 30.
- Hashtag: suppressed when views < 25,000 OR delta < 100.`
  },
  {
    id: 'TT-FEAT-02',
    title: '[FEAT] TT-FEAT-02: Pure Algorithmic Noise Guardrail Logic',
    labels: ['type:feature', 'role:agent', 'critical-path'],
    body: `### Feature Implementation
- **Target Requirement:** \`REQ-FR-02\`
- **Role:** Coding Agent
- **Dependencies:** Blocked by \`TT-TEST-02\`
- **Blocks:** \`TT-VERIF-01\`, \`TT-TEST-04\`
- **Estimated Duration:** Agent: 10 min | Human review: 20 min

#### Objective
Implement \`checkNoiseGuardrail\` in \`src/trendScorer.js\` as a pure deterministic function.`
  },
  {
    id: 'TT-TEST-03',
    title: '[TEST] TT-TEST-03: Multi-Window Velocity & VVS Composite Calculus Tests',
    labels: ['type:test', 'role:agent', 'critical-path'],
    body: `### Test-First Specification (High-Cost of Failure)
- **Target Requirement:** \`REQ-FR-03\`, \`REQ-NFR-01\`
- **Role:** Coding Agent
- **Dependencies:** Blocked by \`TT-GATE-01\`
- **Blocks:** \`TT-FEAT-03\`
- **Estimated Duration:** Agent: 8 min | Human review: 30 min

#### Mathematical Invariants
- Assert weights $w_1 = 0.50, w_6 = 0.35, w_{24} = 0.15$.
- Verify weight re-normalization when history is < 6h or < 24h.`
  },
  {
    id: 'TT-FEAT-03',
    title: '[FEAT] TT-FEAT-03: Mathematical Engine calculateMultiWindowVVS',
    labels: ['type:feature', 'role:agent', 'critical-path'],
    body: `### Feature Implementation
- **Target Requirement:** \`REQ-FR-03\`, \`REQ-NFR-01\`
- **Role:** Coding Agent
- **Dependencies:** Blocked by \`TT-TEST-03\`
- **Blocks:** \`TT-VERIF-01\`, \`TT-TEST-04\`
- **Estimated Duration:** Agent: 12 min | Human review: 25 min

#### Objective
Implement \`calculateMultiWindowVVS\` in \`src/trendScorer.js\` with latency < 0.5ms.`
  },
  {
    id: 'TT-TEST-04',
    title: '[TEST] TT-TEST-04: Trend Lifecycle State Machine Transition Tests',
    labels: ['type:test', 'role:agent', 'critical-path'],
    body: `### Test-First Specification
- **Target Requirement:** \`REQ-FR-04\`
- **Role:** Coding Agent
- **Dependencies:** Blocked by \`TT-FEAT-02\`, \`TT-FEAT-03\`
- **Blocks:** \`TT-FEAT-04\`
- **Estimated Duration:** Agent: 5 min | Human review: 20 min

#### Acceptance States
- Validate transitions across \`NOISE\`, \`EMERGING\`, \`VIRAL\`, \`SATURATED\`, \`DECAYING\`.`
  },
  {
    id: 'TT-FEAT-04',
    title: '[FEAT] TT-FEAT-04: State Machine Evaluator determineLifecycleStatus',
    labels: ['type:feature', 'role:agent', 'critical-path'],
    body: `### Feature Implementation
- **Target Requirement:** \`REQ-FR-04\`
- **Role:** Coding Agent
- **Dependencies:** Blocked by \`TT-TEST-04\`
- **Blocks:** \`TT-VERIF-01\`
- **Estimated Duration:** Agent: 10 min | Human review: 20 min

#### Objective
Implement \`determineLifecycleStatus\` in \`src/trendScorer.js\`.`
  },
  {
    id: 'TT-TEST-05',
    title: '[TEST] TT-TEST-05: Emerging Leaderboard & Correlation Query Tests',
    labels: ['type:test', 'role:agent'],
    body: `### Test-First Specification
- **Target Requirement:** \`REQ-FR-05\`, \`REQ-FR-06\`
- **Role:** Coding Agent
- **Dependencies:** Blocked by \`TT-GATE-01\`
- **Blocks:** \`TT-FEAT-05\`
- **Estimated Duration:** Agent: 6 min | Human review: 20 min`
  },
  {
    id: 'TT-FEAT-05',
    title: '[FEAT] TT-FEAT-05: HTTP Query Endpoints (/emerging, /correlations)',
    labels: ['type:feature', 'role:agent'],
    body: `### Feature Implementation
- **Target Requirement:** \`REQ-FR-05\`, \`REQ-FR-06\`
- **Role:** Coding Agent
- **Dependencies:** Blocked by \`TT-TEST-05\`
- **Blocks:** \`TT-VERIF-01\`
- **Estimated Duration:** Agent: 12 min | Human review: 20 min`
  },
  {
    id: 'TT-TEST-06',
    title: '[TEST] TT-TEST-06: Golden Set Simulation Loader & 24h Buffer TTL Tests',
    labels: ['type:test', 'role:agent'],
    body: `### Test-First Specification
- **Target Requirement:** \`REQ-FR-07\`, \`REQ-NFR-02\`
- **Role:** Coding Agent
- **Dependencies:** Blocked by \`TT-GATE-01\`
- **Blocks:** \`TT-FEAT-06\`
- **Estimated Duration:** Agent: 5 min | Human review: 15 min`
  },
  {
    id: 'TT-FEAT-06',
    title: '[FEAT] TT-FEAT-06: In-Memory Ring Buffer Store & Seed Generator',
    labels: ['type:feature', 'role:agent'],
    body: `### Feature Implementation
- **Target Requirement:** \`REQ-FR-07\`, \`REQ-NFR-02\`
- **Role:** Coding Agent
- **Dependencies:** Blocked by \`TT-TEST-06\`
- **Blocks:** \`TT-VERIF-01\`
- **Estimated Duration:** Agent: 10 min | Human review: 15 min`
  },
  {
    id: 'TT-VERIF-01',
    title: '[VERIF] TT-VERIF-01: Automated Test Suite Run & Latency Benchmark',
    labels: ['type:verification', 'role:agent', 'critical-path'],
    body: `### Automated Verification
- **Target Requirement:** \`REQ-NFR-01\`
- **Role:** Coding Agent
- **Dependencies:** Blocked by \`TT-FEAT-01..06\`
- **Blocks:** \`TT-VALID-01\`, \`TT-DOC-01\`
- **Estimated Duration:** Agent: 2 min | Human review: 15 min

#### Verification Steps
- Execute \`npm test\` across all test suites.
- Assert 100% pass rate.
- Benchmark: VVS calculation executes in under 0.5ms.`
  },
  {
    id: 'TT-VALID-01',
    title: '[VALID] TT-VALID-01: Creator Domain Validation on Real TikTok Scenarios',
    labels: ['type:validation', 'role:human', 'critical-path'],
    body: `### Human Intent Validation
- **Target Objective:** Fitness-for-Purpose Assessment
- **Role:** Human Lead (Lysak Kostiantyn) — *Non-delegable*
- **Dependencies:** Blocked by \`TT-VERIF-01\`
- **Blocks:** \`TT-GATE-02\`
- **Estimated Duration:** Human: 1.5 h

#### Validation Goals
- Verify that real viral breakouts receive \`EMERGING\` or \`VIRAL\` status.
- Confirm zero spam false-positives.`
  },
  {
    id: 'TT-DOC-01',
    title: '[DOC] TT-DOC-01: Bidirectional RTM Updates & Execution Guides',
    labels: ['type:documentation', 'role:collaborative'],
    body: `### Documentation & Traceability
- **Target Artifacts:** \`spec/traceability_matrix.md\`, \`README.md\`
- **Role:** Human + Agent
- **Dependencies:** Blocked by \`TT-VERIF-01\`
- **Blocks:** \`TT-GATE-02\`
- **Estimated Duration:** Agent: 10 min | Human: 30 min`
  },
  {
    id: 'TT-GATE-02',
    title: '[GATE] TT-GATE-02: Checkpoint PLAN-GATE-01 / MVP-GATE Approval',
    labels: ['type:gate', 'role:human', 'critical-path'],
    body: `### Phase 1 Release Gate
- **Target Scope:** Entire Baseline Implementation & Risk Register
- **Role:** Human Lead (Lysak Kostiantyn) — *Non-delegable*
- **Dependencies:** Blocked by \`TT-VALID-01\`, \`TT-DOC-01\`
- **Blocks:** Phase 2 Addenda (\`TT-ADD-01..04\`)
- **Estimated Duration:** Human: 1.0 h

#### Gate Outcome
- Record formal decision in \`logs/plan_gate_decision.md\` with **GO** verdict.`
  },
  {
    id: 'TT-ADD-01',
    title: '[ADD] TT-ADD-01: Web Dashboard UI & Time-Step Simulation Controller',
    labels: ['type:addendum', 'role:collaborative'],
    body: `### Formal SDD Scope Addendum
- **Target Requirements:** \`REQ-FR-08\`, \`REQ-FR-09\`, \`REQ-NFR-05\`
- **Role:** Human + Agent
- **Dependencies:** Blocked by \`TT-GATE-02\`
- **Blocks:** \`TT-ADD-02\`
- **Scope:** Interactive HTML5 Bento UI, CSS styling, time simulation step and inject controls.`
  },
  {
    id: 'TT-ADD-02',
    title: '[ADD] TT-ADD-02: Live Feed Ingestion Engine & Saturation Calculus',
    labels: ['type:addendum', 'role:collaborative'],
    body: `### Formal SDD Scope Addendum
- **Target Requirements:** \`REQ-FR-10\`, \`REQ-FR-11\`
- **Role:** Human + Agent
- **Dependencies:** Blocked by \`TT-ADD-01\`
- **Blocks:** \`TT-ADD-03\`
- **Scope:** External API ingestion client and mathematical remaining-hours saturation forecast.`
  },
  {
    id: 'TT-ADD-03',
    title: '[ADD] TT-ADD-03: Native SQLite Store, High-Scale Corpus & Deep-Links',
    labels: ['type:addendum', 'role:collaborative'],
    body: `### Formal SDD Scope Addendum
- **Target Requirements:** \`REQ-FR-12\` through \`REQ-FR-15\`
- **Role:** Human + Agent
- **Dependencies:** Blocked by \`TT-ADD-02\`
- **Blocks:** \`TT-GATE-03\`, \`TT-ADD-04\`
- **Scope:** Node.js native SQLite repository, 1,000+ item corpus scaling, server-side pagination, and canonical TikTok deep-links.`
  },
  {
    id: 'TT-GATE-03',
    title: '[GATE] TT-GATE-03: SCALE-SQLITE-GATE-01 Audit Decision',
    labels: ['type:gate', 'role:human'],
    body: `### Data Architecture Quality Gate
- **Target Requirements:** \`REQ-FR-12..15\`
- **Role:** Human Lead (Lysak Kostiantyn)
- **Dependencies:** Blocked by \`TT-ADD-03\`
- **Blocks:** Production high-scale operations
- **Outcome:** Documented in \`logs/high_scale_sqlite_gate.md\`.`
  },
  {
    id: 'TT-ADD-04',
    title: '[ADD] TT-ADD-04: Chrome CDP Agent, Dual Forecasting & Triad Engine',
    labels: ['type:addendum', 'role:collaborative'],
    body: `### Formal SDD Scope Addendum
- **Target Requirements:** \`REQ-FR-16\` through \`REQ-FR-18\`
- **Role:** Human + Agent
- **Dependencies:** Blocked by \`TT-ADD-03\`
- **Scope:** Headless Chrome CDP scraper, Holt impulse-response model, logistic S-curves, genetic hyperparameter tuner, and 1-2-3 breakout hashtag triad generator.`
  }
];

// Helper: GitHub API request
async function githubRequest(endpoint, method = 'GET', data = null) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'TrendTok-SDD-Sync-Script',
    'Authorization': `Bearer ${token}`
  };
  if (data) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined
  });

  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

// Main Execution
async function main() {
  console.log('====================================================');
  console.log(` TrendTok Analytics — GitHub SDD Issue Synchronizer `);
  console.log(` Target Repo: ${REPO_OWNER}/${REPO_NAME}`);
  console.log(` Mode: ${isDryRun ? 'DRY-RUN (Simulated)' : 'LIVE SYNC (GitHub REST API)'}`);
  console.log('====================================================\n');

  // Export JSON & Markdown artifacts locally
  const docsDir = resolve(process.cwd(), 'docs');
  if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });

  const exportPathJson = resolve(docsDir, 'github_issues_export.json');
  writeFileSync(exportPathJson, JSON.stringify({ labels: LABELS, tickets: TICKETS }, null, 2), 'utf-8');
  console.log(`✔ Exported issue definitions to: docs/github_issues_export.json`);

  // Generate markdown board
  let mdBoard = `# TrendTok Analytics — SDD GitHub Kanban Board\n\n`;
  mdBoard += `| Issue ID | Type | Title | Role | Dependencies | Critical Path |\n`;
  mdBoard += `|---|---|---|---|---|:---:|\n`;
  for (const t of TICKETS) {
    const isCrit = t.labels.includes('critical-path') ? 'YES' : 'No';
    const typeLabel = t.labels.find(l => l.startsWith('type:')) || 'type:other';
    const roleLabel = t.labels.find(l => l.startsWith('role:')) || 'role:other';
    mdBoard += `| **${t.id}** | \`${typeLabel}\` | ${t.title} | \`${roleLabel}\` | \`${t.body.match(/Dependencies:[^\n]+/)?.[0]?.replace('Dependencies: ', '') || 'None'}\` | **${isCrit}** |\n`;
  }
  const exportPathMd = resolve(docsDir, 'github_issues_board.md');
  writeFileSync(exportPathMd, mdBoard, 'utf-8');
  console.log(`✔ Exported Kanban board markdown to: docs/github_issues_board.md\n`);

  if (isDryRun) {
    console.log(`[DRY-RUN] Verified ${LABELS.length} labels and ${TICKETS.length} SDD tickets.`);
    console.log(`[DRY-RUN] To push live to GitHub, obtain a Personal Access Token (PAT) with repo scope and run:`);
    console.log(`          node scripts/sync-github-issues.js --token ghp_yourTokenHere\n`);
    return;
  }

  // Live Sync
  console.log(`--> [1/2] Synchronizing ${LABELS.length} SDD Labels...`);
  for (const lbl of LABELS) {
    const check = await githubRequest(`/labels/${encodeURIComponent(lbl.name)}`);
    if (check.ok) {
      console.log(`  [EXISTS] Label "${lbl.name}"`);
    } else {
      const createRes = await githubRequest('/labels', 'POST', lbl);
      if (createRes.ok) {
        console.log(`  [CREATED] Label "${lbl.name}" (#${lbl.color})`);
      } else {
        console.warn(`  [FAILED] Label "${lbl.name}":`, createRes.body?.message || createRes.status);
      }
    }
  }

  console.log(`\n--> [2/2] Synchronizing ${TICKETS.length} SDD Issues...`);
  const existingIssuesRes = await githubRequest('/issues?state=all&per_page=100');
  const existingTitles = new Set(
    Array.isArray(existingIssuesRes.body) ? existingIssuesRes.body.map(i => i.title) : []
  );

  let createdCount = 0;
  for (const t of TICKETS) {
    if (existingTitles.has(t.title)) {
      console.log(`  [SKIPPED] Issue "${t.id}" already exists on GitHub.`);
      continue;
    }

    const payload = {
      title: t.title,
      body: t.body,
      labels: t.labels
    };

    const res = await githubRequest('/issues', 'POST', payload);
    if (res.ok) {
      console.log(`  [CREATED] #${res.body.number} ${t.id}: ${t.title}`);
      createdCount++;
    } else {
      console.error(`  [ERROR] Failed to create "${t.id}":`, res.body?.message || res.status);
    }
  }

  console.log(`\n====================================================`);
  console.log(`✔ Sync Complete! Created ${createdCount} issues on GitHub.`);
  console.log(`View live at: https://github.com/${REPO_OWNER}/${REPO_NAME}/issues`);
  console.log(`====================================================\n`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
