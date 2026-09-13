# TrendTok Analytics

> **TikTok Viral Content Analytics Web Service**  
> An automated Node.js web application for ingesting, scoring, visualizing, and predicting the trajectory of trending hashtags, sounds, and media formats on TikTok.

---

## 1. Project Overview

TrendTok Analytics is designed to assist digital marketing specialists, SMM managers, content creators, and media analysts in tracking high-velocity trends on TikTok. By capturing rapid changes in view counts, post creation rates, and audio usage over time, the platform identifies emerging viral trends before they reach market saturation.

### Key Objectives
* **Automated Data Ingestion**: Continuously capture metric snapshots for trending hashtags, sounds, and creative formats.
* **Virality & Velocity Scoring**: Calculate growth acceleration and categorize trends into lifecycle stages (*Emerging*, *Peak*, *Declining*).
* **Interactive Web Dashboard**: Provide intuitive visual dashboards, trend leaderboards, and historical trajectory graphs powered by Node.js web services.
* **Proactive Alerting**: Deliver automated notifications via webhooks and messaging channels when threshold criteria are met.

---

## 2. SDD Repository Structure

The repository follows the **Specification-Driven Development (SDD)** paradigm, maintaining a unified repository for all lifecycle artifacts:

```text
TrendTok Analytics/
├── .gitignore              # Ignored runtimes, dependencies, and OS metadata
├── package.json            # Node.js project manifest & scripts
├── README.md               # Project documentation and setup guide
├── spec/                   # Specification artifacts (Single Source of Truth)
│   └── system_concept.md   # Initial concept description and requirements baseline
├── src/                    # Application source code (Node.js web backend, scrapers)
│   ├── index.js            # Web server entrypoint
│   └── trendScorer.js      # Core trend virality velocity calculation engine
├── tests/                  # Automated verification suites (Node.js native test runner)
│   └── trendScorer.test.js # Unit test specifications
├── docs/                   # Supplementary architectural and user documentation
│   └── .gitkeep
└── logs/                   # Agent interaction logs and GATE decision records
    ├── agent_profile.md    # Coding agent classification and operational rules
    └── git_gate_decision.md# Decision record for conflict resolutions
```

---

## 3. Commit Convention

Commit messages must explicitly reflect the artifact type and SDD action:

* `spec:` — Changes or additions to system specifications.
* `test:` — Test suite updates, test cases, or fixtures.
* `feat:` — Implementation of new application features or components in `/src`.
* `docs:` — Updates to documentation in `/docs` or repository `README.md`.
* `gate:` — Formal GATE decisions (e.g., `GIT-GATE` conflict resolutions).
* `fix:`  — Bug fixes and error resolutions.
* `refactor:` — Code structure improvements without behavioral changes.

---

## 4. Quick Start (Node.js)

* **Run tests**: `npm test` or `node --test tests/**/*.test.js`
* **Run server**: `npm start` or `node src/index.js`
