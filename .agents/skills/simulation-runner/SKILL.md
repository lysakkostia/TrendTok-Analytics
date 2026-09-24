---
name: simulation-runner
description: >-
  Use this skill when initializing the Golden Set test environment, stepping time
  forward in the simulation, injecting virality spikes or noise anomalies, and verifying
  state transitions in TrendTok Analytics.
---

# Simulation Runner Skill

This skill instructs the agent on how to operate and verify the deterministic simulation engine of TrendTok Analytics.

---

## 1. Available Simulation Endpoints

The system exposes three specialized simulation management endpoints:

| Endpoint | Method | Purpose | Typical Scenario |
|---|---|---|---|
| `/api/simulation/seed` | `POST` | Loads canonical Golden Set (5 sounds, 5 hashtags across 24h) | Resetting state to an oracle baseline |
| `/api/simulation/step` | `POST` | Advances simulation clock by $+1$ hour | Observing trajectory transitions and decay |
| `/api/simulation/inject` | `POST` | Injects synthetic anomalies (`viral_spike` or `noise_spike`) | Testing noise guardrail filtering and peak alerts |

---

## 2. Terminal Quick-Commands

```bash
# 1. Seed canonical Golden Set
curl -s -X POST http://localhost:3000/api/simulation/seed | jq .

# 2. Step time forward by 1 hour
curl -s -X POST http://localhost:3000/api/simulation/step | jq .

# 3. Inject sudden viral spike sound
curl -s -X POST http://localhost:3000/api/simulation/inject \
  -H "Content-Type: application/json" \
  -d '{"scenario": "viral_spike", "itemId": "sound_neon_wave", "title": "Neon Wave 2026"}' | jq .

# 4. Ingest custom metric snapshot
curl -s -X POST http://localhost:3000/api/snapshots \
  -H "Content-Type: application/json" \
  -d '{"itemId": "sound_test", "type": "sound", "totalViews": 50000, "totalVideos": 350}' | jq .
```

---

## 3. Verification Invariants

When running simulations:
1. Items in `EMERGING` status must maintain $VVS \ge 50.0$ and positive acceleration ($a > 0$).
2. Items failing Noise Guardrails (e.g. sound with $< 15\text{k}$ views or $< 30$ delta) must immediately drop to `NOISE` status with $VVS = 0.0$.
3. History buffer must automatically prune to at most 48 hourly snapshots (rolling TTL).
