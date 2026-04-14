import { PATTERN_LABELS, SLOT_LABELS } from "./constants";

export type PatternId = 0 | 1 | 2 | 3;
export type PreviousPatternInput = "unknown" | `${PatternId}`;
export type RiskProfile = "conservative" | "neutral" | "aggressive";

export type DecisionInput = {
  buyPrice: number | null;
  previousPattern: PreviousPatternInput;
  riskProfile: RiskProfile;
  observations: Array<number | null>;
};

type BranchDefinition = {
  id: string;
  pattern: PatternId;
  probability: number;
  sample: (context: SimulationContext) => boolean;
};

type SimulationContext = {
  buyPrice: number;
  observations: Array<number | null>;
  prices: number[];
  rng: Random;
  weight: number;
};

type Particle = {
  pattern: PatternId;
  branchId: string;
  prices: number[];
  weight: number;
};

type FutureNode = {
  weight: number;
  children: Map<number, FutureNode>;
};

type FutureSummary = {
  distribution: Array<{ value: number; probability: number }>;
  mean: number;
  standardDeviation: number;
};

export type CalculationResult =
  | {
      status: "input-error";
      message: string;
    }
  | {
      status: "inconsistent";
      message: string;
    }
  | {
      status: "ok";
      currentSlot: number;
      currentSlotLabel: string;
      currentPrice: number;
      recommendation: "sell" | "wait";
      sellNowScore: number;
      continuationValue: number;
      adjustedContinuationValue: number;
      betterProbability: number;
      futureValueBands: {
        low: number;
        median: number;
        high: number;
      } | null;
      patternProbabilities: Array<{
        pattern: PatternId;
        label: (typeof PATTERN_LABELS)[PatternId];
        probability: number;
      }>;
      posteriorParticleCount: number;
    };

const TRANSITION_MATRIX: ReadonlyArray<ReadonlyArray<number>> = [
  [0.2, 0.3, 0.15, 0.35],
  [0.5, 0.05, 0.2, 0.25],
  [0.25, 0.45, 0.05, 0.25],
  [0.45, 0.25, 0.15, 0.15],
];

const RISK_LAMBDA: Record<RiskProfile, number> = {
  conservative: 0.45,
  neutral: 0,
  aggressive: -0.45,
};

const PARTICLES_PER_BRANCH = 96;
const EPSILON = 1e-9;

function priceFromRate(rate: number, buyPrice: number, offset = 0) {
  return Math.ceil(rate * buyPrice - EPSILON) + offset;
}

function getObservedRateInterval(price: number, buyPrice: number, offset = 0) {
  if (offset === -1) {
    return {
      low: price / buyPrice,
      high: (price + 1) / buyPrice,
    };
  }

  return {
    low: (price - 1) / buyPrice,
    high: price / buyPrice,
  };
}

function normalizeWeights<T extends { weight: number }>(values: T[]) {
  const totalWeight = values.reduce((sum, value) => sum + value.weight, 0);
  if (totalWeight <= 0) {
    return [];
  }

  return values.map((value) => ({
    ...value,
    weight: value.weight / totalWeight,
  }));
}

function quantile(distribution: Array<{ value: number; probability: number }>, target: number) {
  let running = 0;
  const sorted = [...distribution].sort((left, right) => left.value - right.value);

  for (const entry of sorted) {
    running += entry.probability;
    if (running + EPSILON >= target) {
      return entry.value;
    }
  }

  return sorted.at(-1)?.value ?? 0;
}

class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  next() {
    this.state += 0x6d2b79f5;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sampleUnobservedRate(context: SimulationContext, start: number, end: number) {
  return start + context.rng.next() * (end - start);
}

function sampleObservedRate(
  context: SimulationContext,
  start: number,
  end: number,
  observedPrice: number,
  offset = 0,
) {
  const totalLow = Math.min(start, end);
  const totalHigh = Math.max(start, end);
  const observed = getObservedRateInterval(observedPrice, context.buyPrice, offset);
  const feasibleLow = Math.max(totalLow, observed.low);
  const feasibleHigh = Math.min(totalHigh, observed.high);
  const width = feasibleHigh - feasibleLow;

  if (width <= EPSILON) {
    return null;
  }

  context.weight *= width / (totalHigh - totalLow);
  return feasibleLow + context.rng.next() * width;
}

function fillIndependentSlot(
  context: SimulationContext,
  slot: number,
  start: number,
  end: number,
  offset = 0,
) {
  const observedPrice = context.observations[slot];
  const rate =
    observedPrice === null
      ? sampleUnobservedRate(context, start, end)
      : sampleObservedRate(context, start, end, observedPrice, offset);

  if (rate === null) {
    return false;
  }

  context.prices[slot] = observedPrice ?? priceFromRate(rate, context.buyPrice, offset);
  return true;
}

function runIndependentPhase(
  context: SimulationContext,
  startSlot: number,
  length: number,
  start: number,
  end: number,
  offset = 0,
) {
  for (let index = 0; index < length; index += 1) {
    if (!fillIndependentSlot(context, startSlot + index, start, end, offset)) {
      return false;
    }
  }

  return true;
}

function runDecreasingPhase(
  context: SimulationContext,
  startSlot: number,
  length: number,
  start: number,
  end: number,
  baseDrop: number,
  randomDropRange: number,
) {
  const firstObserved = context.observations[startSlot];
  let currentRate =
    firstObserved === null
      ? sampleUnobservedRate(context, start, end)
      : sampleObservedRate(context, start, end, firstObserved);

  if (currentRate === null) {
    return false;
  }

  for (let index = 0; index < length; index += 1) {
    const slot = startSlot + index;
    context.prices[slot] = context.observations[slot] ?? priceFromRate(currentRate, context.buyPrice);

    if (index === length - 1) {
      continue;
    }

    const nextObserved = context.observations[slot + 1];
    let randomDrop = context.rng.next() * randomDropRange;

    if (nextObserved !== null) {
      const interval = getObservedRateInterval(nextObserved, context.buyPrice);
      const feasibleLow = Math.max(0, currentRate - baseDrop - interval.high);
      const feasibleHigh = Math.min(randomDropRange, currentRate - baseDrop - interval.low);
      const width = feasibleHigh - feasibleLow;

      if (width <= EPSILON) {
        return false;
      }

      context.weight *= width / randomDropRange;
      randomDrop = feasibleLow + context.rng.next() * width;
    }

    currentRate -= baseDrop + randomDrop;
  }

  return true;
}

const ALL_BRANCHES: BranchDefinition[] = [
  ...(() => {
    const branches: BranchDefinition[] = [];

    for (const firstDecreaseLength of [2, 3]) {
      const secondDecreaseLength = 5 - firstDecreaseLength;

      for (let firstHighLength = 0; firstHighLength <= 6; firstHighLength += 1) {
        const remainingHighLength = 7 - firstHighLength;

        for (let thirdHighLength = 0; thirdHighLength < remainingHighLength; thirdHighLength += 1) {
          const secondHighLength = remainingHighLength - thirdHighLength;
          const branchProbability = 0.5 * (1 / 7) * (1 / remainingHighLength);

          branches.push({
            id: `0-${firstDecreaseLength}-${firstHighLength}-${thirdHighLength}`,
            pattern: 0,
            probability: branchProbability,
            sample(context) {
              let slot = 0;

              if (!runIndependentPhase(context, slot, firstHighLength, 0.9, 1.4)) {
                return false;
              }
              slot += firstHighLength;

              if (!runDecreasingPhase(context, slot, firstDecreaseLength, 0.8, 0.6, 0.04, 0.06)) {
                return false;
              }
              slot += firstDecreaseLength;

              if (!runIndependentPhase(context, slot, secondHighLength, 0.9, 1.4)) {
                return false;
              }
              slot += secondHighLength;

              if (!runDecreasingPhase(context, slot, secondDecreaseLength, 0.8, 0.6, 0.04, 0.06)) {
                return false;
              }
              slot += secondDecreaseLength;

              return runIndependentPhase(context, slot, thirdHighLength, 0.9, 1.4);
            },
          });
        }
      }
    }

    return branches;
  })(),
  ...Array.from({ length: 7 }, (_, index): BranchDefinition => {
    const peakStart = index + 3;
    const firstDecreaseLength = peakStart - 2;

    return {
      id: `1-${peakStart}`,
      pattern: 1,
      probability: 1 / 7,
      sample(context) {
        let slot = 0;

        if (!runDecreasingPhase(context, slot, firstDecreaseLength, 0.9, 0.85, 0.03, 0.02)) {
          return false;
        }
        slot += firstDecreaseLength;

        if (!runIndependentPhase(context, slot, 1, 0.9, 1.4)) {
          return false;
        }
        slot += 1;

        if (!runIndependentPhase(context, slot, 1, 1.4, 2.0)) {
          return false;
        }
        slot += 1;

        if (!runIndependentPhase(context, slot, 1, 2.0, 6.0)) {
          return false;
        }
        slot += 1;

        if (!runIndependentPhase(context, slot, 1, 1.4, 2.0)) {
          return false;
        }
        slot += 1;

        if (!runIndependentPhase(context, slot, 1, 0.9, 1.4)) {
          return false;
        }
        slot += 1;

        return runIndependentPhase(context, slot, 12 - slot, 0.4, 0.9);
      },
    };
  }),
  {
    id: "2",
    pattern: 2,
    probability: 1,
    sample(context) {
      return runDecreasingPhase(context, 0, 12, 0.9, 0.85, 0.03, 0.02);
    },
  },
  ...Array.from({ length: 8 }, (_, index): BranchDefinition => {
    const peakStart = index + 2;
    const firstDecreaseLength = peakStart - 2;

    return {
      id: `3-${peakStart}`,
      pattern: 3,
      probability: 1 / 8,
      sample(context) {
        let slot = 0;

        if (!runDecreasingPhase(context, slot, firstDecreaseLength, 0.9, 0.4, 0.03, 0.02)) {
          return false;
        }
        slot += firstDecreaseLength;

        if (!runIndependentPhase(context, slot, 2, 0.9, 1.4)) {
          return false;
        }
        slot += 2;

        const peakObserved = context.observations[slot + 1];
        let peakRate =
          peakObserved === null
            ? sampleUnobservedRate(context, 1.4, 2.0)
            : sampleObservedRate(context, 1.4, 2.0, peakObserved);

        if (peakRate === null) {
          return false;
        }

        const leftObserved = context.observations[slot];
        const rightObserved = context.observations[slot + 2];
        let leftRate = sampleUnobservedRate(context, 1.4, peakRate);
        let rightRate = sampleUnobservedRate(context, 1.4, peakRate);

        if (leftObserved !== null) {
          leftRate = sampleObservedRate(context, 1.4, peakRate, leftObserved, -1) ?? Number.NaN;
        }
        if (rightObserved !== null) {
          rightRate = sampleObservedRate(context, 1.4, peakRate, rightObserved, -1) ?? Number.NaN;
        }

        if (!Number.isFinite(leftRate) || !Number.isFinite(rightRate)) {
          return false;
        }

        context.prices[slot] = leftObserved ?? priceFromRate(leftRate, context.buyPrice, -1);
        context.prices[slot + 1] = peakObserved ?? priceFromRate(peakRate, context.buyPrice);
        context.prices[slot + 2] = rightObserved ?? priceFromRate(rightRate, context.buyPrice, -1);
        slot += 3;

        return runDecreasingPhase(context, slot, 12 - slot, 0.9, 0.4, 0.03, 0.02);
      },
    };
  }),
];

function getPatternPrior(previousPattern: PreviousPatternInput) {
  if (previousPattern !== "unknown") {
    return [...TRANSITION_MATRIX[Number(previousPattern)]];
  }

  let distribution = [0.25, 0.25, 0.25, 0.25];

  for (let iteration = 0; iteration < 64; iteration += 1) {
    distribution = TRANSITION_MATRIX[0].map(
      (_, targetIndex) =>
        distribution.reduce(
          (sum, value, sourceIndex) => sum + value * TRANSITION_MATRIX[sourceIndex][targetIndex],
          0,
        ),
    );
  }

  return distribution;
}

function validateInput(input: DecisionInput) {
  if (input.buyPrice === null || !Number.isInteger(input.buyPrice)) {
    return "日曜の購入価格を入力してください。";
  }

  if (input.buyPrice < 90 || input.buyPrice > 110) {
    return "購入価格は 90〜110 ベルで入力してください。";
  }

  if (input.observations.length !== SLOT_LABELS.length) {
    return "価格欄の数が不正です。";
  }

  const filledIndexes = input.observations.flatMap((value, index) => (value === null ? [] : [index]));
  if (filledIndexes.length === 0) {
    return "今週ここまでのカブ価を少なくとも 1 つ入力してください。";
  }

  for (let index = 0; index < input.observations.length; index += 1) {
    const value = input.observations[index];
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 660)) {
      return "各カブ価は 1〜660 ベルの整数で入力してください。";
    }
  }

  return null;
}

function createPosteriorParticles(input: DecisionInput) {
  const patternPrior = getPatternPrior(input.previousPattern);
  const seedBase = hashString(JSON.stringify(input));
  const particles: Particle[] = [];

  ALL_BRANCHES.forEach((branch, branchIndex) => {
    const branchPrior = patternPrior[branch.pattern] * branch.probability;

    if (branchPrior <= 0) {
      return;
    }

    for (let particleIndex = 0; particleIndex < PARTICLES_PER_BRANCH; particleIndex += 1) {
      const seed = seedBase ^ ((branchIndex + 1) * 0x9e3779b1) ^ ((particleIndex + 1) * 0x85ebca6b);
      const context: SimulationContext = {
        buyPrice: input.buyPrice ?? 0,
        observations: input.observations,
        prices: Array.from({ length: SLOT_LABELS.length }, () => 0),
        rng: new Random(seed),
        weight: branchPrior / PARTICLES_PER_BRANCH,
      };

      if (!branch.sample(context) || context.weight <= 0) {
        continue;
      }

      let matches = true;
      for (let slot = 0; slot < SLOT_LABELS.length; slot += 1) {
        const observed = input.observations[slot];
        if (observed !== null && context.prices[slot] !== observed) {
          matches = false;
          break;
        }
      }

      if (!matches) {
        continue;
      }

      particles.push({
        pattern: branch.pattern,
        branchId: branch.id,
        prices: [...context.prices],
        weight: context.weight,
      });
    }
  });

  return normalizeWeights(particles);
}

function buildFutureTree(particles: Particle[], startSlot: number) {
  const root: FutureNode = {
    weight: particles.reduce((sum, particle) => sum + particle.weight, 0),
    children: new Map(),
  };

  for (const particle of particles) {
    let currentNode = root;

    for (let slot = startSlot; slot < SLOT_LABELS.length; slot += 1) {
      const price = particle.prices[slot];
      const nextNode = currentNode.children.get(price) ?? {
        weight: 0,
        children: new Map<number, FutureNode>(),
      };
      nextNode.weight += particle.weight;
      currentNode.children.set(price, nextNode);
      currentNode = nextNode;
    }
  }

  return root;
}

function summarizeFuture(root: FutureNode) {
  const cache = new WeakMap<FutureNode, FutureSummary>();

  function summarize(node: FutureNode): FutureSummary {
    const cached = cache.get(node);
    if (cached) {
      return cached;
    }

    if (node.children.size === 0 || node.weight <= 0) {
      const summary = {
        distribution: [{ value: 0, probability: 1 }],
        mean: 0,
        standardDeviation: 0,
      };
      cache.set(node, summary);
      return summary;
    }

    const aggregated = new Map<number, number>();
    let mean = 0;

    for (const [price, child] of node.children) {
      const childSummary = summarize(child);
      const probability = child.weight / node.weight;
      const decisionValue = Math.max(price, childSummary.mean);
      aggregated.set(decisionValue, (aggregated.get(decisionValue) ?? 0) + probability);
      mean += probability * decisionValue;
    }

    let variance = 0;
    const distribution = [...aggregated.entries()].map(([value, probability]) => ({
      value,
      probability,
    }));

    for (const entry of distribution) {
      variance += entry.probability * (entry.value - mean) ** 2;
    }

    const summary = {
      distribution,
      mean,
      standardDeviation: Math.sqrt(Math.max(variance, 0)),
    };

    cache.set(node, summary);
    return summary;
  }

  return summarize(root);
}

export function calculateTurnipDecision(input: DecisionInput): CalculationResult {
  const validationError = validateInput(input);
  if (validationError) {
    return {
      status: "input-error",
      message: validationError,
    };
  }

  let currentSlot = -1;
  for (let index = 0; index < input.observations.length; index += 1) {
    if (input.observations[index] !== null) {
      currentSlot = index;
    }
  }

  const currentPrice = currentSlot >= 0 ? input.observations[currentSlot] : null;
  const posterior = createPosteriorParticles(input);

  if (posterior.length === 0 || currentPrice === null) {
    return {
      status: "inconsistent",
      message: "整合する状態が存在しません。購入価格か時間順の入力を確認してください。",
    };
  }

  const futureSummary =
    currentSlot === SLOT_LABELS.length - 1
      ? {
          distribution: [{ value: 0, probability: 1 }],
          mean: 0,
          standardDeviation: 0,
        }
      : summarizeFuture(buildFutureTree(posterior, currentSlot + 1));

  const adjustedContinuationValue =
    futureSummary.mean - RISK_LAMBDA[input.riskProfile] * futureSummary.standardDeviation;
  const sellNowScore = currentPrice - adjustedContinuationValue;
  const patternProbabilities = (Object.keys(PATTERN_LABELS) as Array<`${PatternId}`>)
    .map((pattern) => {
      const numericPattern = Number(pattern) as PatternId;
      const probability = posterior
        .filter((particle) => particle.pattern === numericPattern)
        .reduce((sum, particle) => sum + particle.weight, 0);

      return {
        pattern: numericPattern,
        label: PATTERN_LABELS[numericPattern],
        probability,
      };
    })
    .sort((left, right) => right.probability - left.probability);

  const betterProbability = futureSummary.distribution
    .filter((entry) => entry.value > currentPrice)
    .reduce((sum, entry) => sum + entry.probability, 0);

  const futureValueBands =
    currentSlot === SLOT_LABELS.length - 1
      ? null
      : {
          low: quantile(futureSummary.distribution, 0.1),
          median: quantile(futureSummary.distribution, 0.5),
          high: quantile(futureSummary.distribution, 0.9),
        };

  return {
    status: "ok",
    currentSlot,
    currentSlotLabel: SLOT_LABELS[currentSlot],
    currentPrice,
    recommendation: sellNowScore >= 0 ? "sell" : "wait",
    sellNowScore,
    continuationValue: futureSummary.mean,
    adjustedContinuationValue,
    betterProbability,
    futureValueBands,
    patternProbabilities,
    posteriorParticleCount: posterior.length,
  };
}
