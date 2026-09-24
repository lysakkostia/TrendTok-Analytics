/**
 * TrendTok Analytics — Evolutionary (Genetic) Hyperparameter Tuner
 * Implements REQ-FR-17 (Clause 3): Uses an evolutionary algorithm (Tournament Selection,
 * Blended Crossover, Gaussian Mutation, and Elitism) to optimize forecasting parameters
 * separately for Music (`sound`) and Breakout Hashtags (`hashtag`) on historical backtest data.
 */

import { DEFAULT_SOUND_PARAMS, backtestSoundForecast } from "./soundForecaster.js";
import { DEFAULT_HASHTAG_PARAMS, backtestHashtagForecast } from "./hashtagForecaster.js";

/**
 * Deterministic Mulberry32 pseudo-random number generator in [0, 1).
 *
 * @param {number} [seed=42]
 * @returns {() => number}
 */
export function createSeededRng(seed = 42) {
  let a = (Number(seed) || 42) >>> 0;
  return function rng() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Normalizes window weights (w1, w6, w24) to sum to 1.0.
 *
 * @param {Object} chr
 * @returns {Object}
 */
function normalizeWeights(chr) {
  const w1 = Math.max(0.1, Number(chr.w1) || 0.5);
  const w6 = Math.max(0.05, Number(chr.w6) || 0.35);
  const w24 = Math.max(0.05, Number(chr.w24) || 0.15);
  const sum = w1 + w6 + w24;
  return {
    ...chr,
    w1: Number((w1 / sum).toFixed(4)),
    w6: Number((w6 / sum).toFixed(4)),
    w24: Number((w24 / sum).toFixed(4))
  };
}

/**
 * Clamps a numeric value between min and max.
 */
function clamp(val, min, max) {
  return Number(Math.min(max, Math.max(min, val)).toFixed(4));
}

/**
 * Generates a random chromosome for either 'sound' or 'hashtag' forecasting model.
 *
 * @param {'sound' | 'hashtag'} entityType
 * @param {() => number} rng
 * @returns {Object}
 */
export function createRandomChromosome(entityType = "sound", rng = Math.random) {
  const rawW1 = 0.25 + rng() * 0.60;
  const rawW6 = 0.10 + rng() * 0.50;
  const rawW24 = 0.05 + rng() * 0.30;

  if (entityType === "hashtag") {
    return normalizeWeights({
      w1: rawW1,
      w6: rawW6,
      w24: rawW24,
      alpha: clamp(0.25 + rng() * 0.70, 0.15, 0.98),
      beta: clamp(0.15 + rng() * 0.75, 0.10, 0.95),
      phiDamping: clamp(0.60 + rng() * 0.36, 0.55, 0.98)
    });
  }

  return normalizeWeights({
    w1: rawW1,
    w6: rawW6,
    w24: rawW24,
    logisticRateScale: clamp(0.02 + rng() * 0.35, 0.01, 0.50),
    capacityMultiplier: clamp(1.5 + rng() * 10.0, 1.2, 15.0),
    dampingFactor: clamp(0.55 + rng() * 0.42, 0.50, 0.99)
  });
}

/**
 * Evaluates the fitness and average backtest MAPE of a chromosome across historical snapshot series.
 *
 * @param {Object} chromosome - Candidate hyperparameter set
 * @param {Array<Array<Object>>} historicalSeriesList - List of snapshot arrays
 * @param {'sound' | 'hashtag'} [entityType='sound']
 * @param {number} [holdoutSteps=2]
 * @returns {{ fitness: number, avgMape: number, avgAccuracy: number }}
 */
export function evaluateChromosomeFitness(
  chromosome,
  historicalSeriesList = [],
  entityType = "sound",
  holdoutSteps = 2
) {
  if (!Array.isArray(historicalSeriesList) || historicalSeriesList.length === 0) {
    return { fitness: 50.0, avgMape: 1.0, avgAccuracy: 99.0 };
  }

  let totalMape = 0;
  let validCount = 0;

  for (const series of historicalSeriesList) {
    if (!Array.isArray(series) || series.length < holdoutSteps + 2) continue;
    const bt = entityType === "hashtag"
      ? backtestHashtagForecast(series, holdoutSteps, chromosome)
      : backtestSoundForecast(series, holdoutSteps, chromosome);

    totalMape += bt.mape;
    validCount++;
  }

  if (validCount === 0) {
    return { fitness: 50.0, avgMape: 1.0, avgAccuracy: 99.0 };
  }

  const avgMape = Number((totalMape / validCount).toFixed(3));
  const fitness = Number((100.0 / (1.0 + avgMape)).toFixed(4));
  const avgAccuracy = Number(Math.max(0, 100.0 - avgMape).toFixed(2));

  return { fitness, avgMape, avgAccuracy };
}

/**
 * Performs arithmetic blended crossover between two parent chromosomes.
 *
 * @param {Object} parentA
 * @param {Object} parentB
 * @param {() => number} [rng=Math.random]
 * @returns {Object} Child chromosome
 */
export function crossoverChromosomes(parentA, parentB, rng = Math.random) {
  const child = {};
  const keys = Object.keys(parentA);

  for (const key of keys) {
    const blend = rng();
    const valA = Number(parentA[key]) || 0;
    const valB = Number(parentB[key]) || 0;
    child[key] = Number((blend * valA + (1 - blend) * valB).toFixed(4));
  }

  return normalizeWeights(child);
}

/**
 * Applies bounded perturbation mutation to a chromosome.
 *
 * @param {Object} chromosome
 * @param {'sound' | 'hashtag'} [entityType='sound']
 * @param {number} [mutationRate=0.25]
 * @param {() => number} [rng=Math.random]
 * @returns {Object} Mutated chromosome
 */
export function mutateChromosome(
  chromosome,
  entityType = "sound",
  mutationRate = 0.25,
  rng = Math.random
) {
  const mutated = { ...chromosome };
  const delta = () => (rng() - 0.5) * 0.24;

  if (rng() < mutationRate) mutated.w1 = clamp(mutated.w1 + delta(), 0.10, 0.85);
  if (rng() < mutationRate) mutated.w6 = clamp(mutated.w6 + delta(), 0.05, 0.70);
  if (rng() < mutationRate) mutated.w24 = clamp(mutated.w24 + delta(), 0.05, 0.50);

  if (entityType === "hashtag") {
    if (rng() < mutationRate) mutated.alpha = clamp(mutated.alpha + delta(), 0.15, 0.98);
    if (rng() < mutationRate) mutated.beta = clamp(mutated.beta + delta(), 0.10, 0.95);
    if (rng() < mutationRate) mutated.phiDamping = clamp(mutated.phiDamping + delta() * 0.5, 0.55, 0.98);
  } else {
    if (rng() < mutationRate) mutated.logisticRateScale = clamp(mutated.logisticRateScale + delta() * 0.4, 0.01, 0.50);
    if (rng() < mutationRate) mutated.capacityMultiplier = clamp(mutated.capacityMultiplier + delta() * 6.0, 1.2, 15.0);
    if (rng() < mutationRate) mutated.dampingFactor = clamp(mutated.dampingFactor + delta() * 0.5, 0.50, 0.99);
  }

  return normalizeWeights(mutated);
}

/**
 * Evolves optimal forecasting hyperparameters on a set of historical snapshot trajectories.
 * Uses Elitism (top 2 preserved), Tournament Selection (k=3), Blended Crossover, and Mutation.
 *
 * @param {Object} options
 * @param {'sound' | 'hashtag'} [options.entityType='sound']
 * @param {Array<Array<Object>>} [options.historicalSeriesList=[]]
 * @param {number} [options.populationSize=20]
 * @param {number} [options.generations=15]
 * @param {number} [options.mutationRate=0.30]
 * @param {number} [options.holdoutSteps=2]
 * @param {number} [options.seed=42]
 * @returns {Object} Evolutionary optimization summary and best evolved chromosome
 */
export function evolveForecasterWeights({
  entityType = "sound",
  historicalSeriesList = [],
  populationSize = 20,
  generations = 15,
  mutationRate = 0.30,
  holdoutSteps = 2,
  seed = 42
} = {}) {
  const rng = createSeededRng(seed);
  const popSize = Math.max(6, populationSize);
  const gens = Math.max(1, generations);

  const baselineChromosome = entityType === "hashtag"
    ? { ...DEFAULT_HASHTAG_PARAMS }
    : { ...DEFAULT_SOUND_PARAMS };

  const baselineEval = evaluateChromosomeFitness(
    baselineChromosome,
    historicalSeriesList,
    entityType,
    holdoutSteps
  );

  // Initialize population: slot 0 is always the baseline chromosome (guarantees non-degradation)
  let population = [baselineChromosome];
  for (let i = 1; i < popSize; i++) {
    population.push(createRandomChromosome(entityType, rng));
  }

  const convergenceHistory = [];
  let bestOverall = {
    chromosome: baselineChromosome,
    ...baselineEval
  };

  for (let gen = 0; gen < gens; gen++) {
    const scored = population.map(chr => {
      const metrics = evaluateChromosomeFitness(chr, historicalSeriesList, entityType, holdoutSteps);
      return { chromosome: chr, ...metrics };
    });

    scored.sort((a, b) => b.fitness - a.fitness);

    if (scored[0].fitness > bestOverall.fitness) {
      bestOverall = scored[0];
    }

    convergenceHistory.push({
      generation: gen + 1,
      bestFitness: scored[0].fitness,
      bestMape: scored[0].avgMape,
      bestAccuracy: scored[0].avgAccuracy
    });

    // Elitism: top 2 survive directly into next generation
    const nextPop = [scored[0].chromosome, scored[1].chromosome];

    // Tournament selection (k = 3)
    function selectParent() {
      let best = scored[Math.floor(rng() * scored.length)];
      for (let k = 1; k < 3; k++) {
        const contender = scored[Math.floor(rng() * scored.length)];
        if (contender.fitness > best.fitness) {
          best = contender;
        }
      }
      return best.chromosome;
    }

    while (nextPop.length < popSize) {
      const parentA = selectParent();
      const parentB = selectParent();
      const child = crossoverChromosomes(parentA, parentB, rng);
      const mutated = mutateChromosome(child, entityType, mutationRate, rng);
      nextPop.push(mutated);
    }

    population = nextPop;
  }

  const improvementPercent = baselineEval.avgMape > 0
    ? Number((((baselineEval.avgMape - bestOverall.avgMape) / baselineEval.avgMape) * 100).toFixed(2))
    : 0.0;

  return {
    entityType,
    bestChromosome: bestOverall.chromosome,
    baselineMape: baselineEval.avgMape,
    optimizedMape: bestOverall.avgMape,
    baselineFitness: baselineEval.fitness,
    bestFitness: bestOverall.fitness,
    optimizedAccuracy: bestOverall.avgAccuracy,
    improvementPercent: Math.max(0, improvementPercent),
    generationsRun: gens,
    convergenceHistory
  };
}
