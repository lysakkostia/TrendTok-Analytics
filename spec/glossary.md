# Domain Glossary & Ubiquitous Language (TrendTok Analytics)

**Document Identifier:** `GLOSSARY-TRENDTOK-2026-V1`  
**Associated SRS:** [`spec/srs.md`](srs.md)  
**Status:** Approved Baseline  
**Date:** 2026-09-15  

---

## 1. Principles of Ubiquitous Language

In Domain-Driven Design (DDD) and Specification-Driven Development (SDD), all system artifacts—specifications, tickets, BDD scenarios, source code classes, database models, and test assertions—must adhere to a single, unambiguous vocabulary. The table below defines the authoritative terminology for **TrendTok Analytics**.

---

## 2. Definitive Domain Vocabulary

| Term (Ubiquitous Language) | Code Representation | Conceptual Category | Strict Definition |
|---|---|---|---|
| **`TrendItem`** | `class TrendItem` / `item` | Entity | A monitored social media unit representing an audio sound track (`sound`) or a hashtag topic (`hashtag`). Has immutable `id`, `type`, and `title`. |
| **`MetricSnapshot`** | `class MetricSnapshot` / `snapshot` | Value Object | An immutable, timestamped observation containing cumulative `totalViews`, `totalVideos`, and observation timestamp. |
| **`SlidingWindow`** | `windowHours` (1, 6, 24) | Domain Concept | A discrete backward-looking time interval ($\Delta t \in \{1\text{h}, 6\text{h}, 24\text{h}\}$) used to calculate the rate of change of videos. |
| **`VideoVelocity`** ($V$) | `calculateWindowVelocity()` | Metric | The first derivative of newly uploaded videos over elapsed time in hours: $V = \frac{\Delta \text{videos}}{\Delta \text{hours}}$. |
| **`ViralityVelocityScore`** ($\text{VVS}$) | `calculateMultiWindowVVS()` | Composite Metric | A normalized scalar score $\in [0.0..100.0]$ representing composite weighted growth across sliding windows ($0.50 \cdot V_{1\text{h}} + 0.35 \cdot V_{6\text{h}} + 0.15 \cdot V_{24\text{h}}$). |
| **`NoiseGuardrail`** | `checkNoiseGuardrail()` | Validation Policy | An entity-specific threshold boundary enforcing minimum cumulative views and video delta before scoring eligibility (Sound: 15k views, 30 delta; Hashtag: 25k views, 100 delta). |
| **`TrendLifecycleStatus`** | `'NOISE' \| 'EMERGING' \| 'VIRAL' \| 'SATURATED' \| 'DECAYING'` | State Machine Enum | The discrete phase of a trend's viral lifecycle based on score and velocity acceleration. |
| **`EmergingTrend`** | `status === 'EMERGING'` | Business Segment | High-priority trend exhibiting acceleration $a > 0$ and $\text{VVS} \ge 50.0$, indicating pre-saturation growth. |
| **`CrossCorrelation`** | `correlationsStore` | Analytical Relation | A co-occurrence relationship between an audio sound track and associated hashtags appearing in the same videos. |
| **`GoldenSet`** | `POST /api/simulation/seed` | Test Oracle | A deterministic, reproducible reference dataset used to evaluate and benchmark scoring accuracy. |
| **`TTLPruning`** | Rolling ring buffer eviction | Storage Policy | Automated eviction of snapshot observations older than 24 hours to enforce memory bounds. |

---

## 3. Disambiguation Notes
* **`VideoVelocity` vs `ViralityVelocityScore`**: `VideoVelocity` is the raw or single-window rate of creations ($\text{videos}/\text{hour}$). `ViralityVelocityScore` ($\text{VVS}$) is the composite, multi-window, normalized $[0..100]$ index.
* **`NOISE` vs `DECAYING`**: An item is `NOISE` if it has never cleared the minimum volume floor. An item is `DECAYING` if it previously reached virality and is now experiencing negative acceleration with minimal creation volume.
