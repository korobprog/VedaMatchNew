import { Injectable } from '@nestjs/common';
import type {
  SpiritualStage,
  UnionCompatibility,
  UnionCompatibilityBreakdownItem,
  UnionDiet,
  UnionFormat,
  UnionIntentionDto,
  UnionRegulativePrinciple,
} from '@vedamatch/shared';

/** Входные данные одного участника для расчёта совместимости. */
export interface UnionMatchInput {
  intentions: UnionIntentionDto[];
  spiritualStage: SpiritualStage | null;
  interests: string[];
  values: string[];
  city: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
  relocationReady: boolean;
  format: UnionFormat;
  diet: UnionDiet | null;
  regulativePrinciples: UnionRegulativePrinciple[];
}

// Веса критериев, сумма = 100. Образ жизни (питание и регулирующие принципы)
// добавлен за счёт долей намерений и духовного этапа.
const WEIGHTS = {
  intentions: 25,
  stage: 15,
  lifestyle: 15,
  values: 13,
  interests: 12,
  location: 10,
  format: 10,
} as const;

/** Диеты без мяса: между собой считаются близкими, но не тождественными. */
const MEATLESS_DIETS: UnionDiet[] = [
  'vegetarian',
  'vegan',
  'prasadam_only',
  'transitioning',
];

const TOTAL_PRINCIPLES = 4;

const STAGE_ORDER: SpiritualStage[] = [
  'seeker',
  'practitioner',
  'yogi',
  'devotee',
];

// Нейтральная оценка, когда данных недостаточно для сравнения
const NEUTRAL_SCORE = 50;

@Injectable()
export class UnionMatchingService {
  computeCompatibility(
    me: UnionMatchInput,
    other: UnionMatchInput,
  ): UnionCompatibility {
    const breakdown: UnionCompatibilityBreakdownItem[] = [
      {
        criterion: 'intentions',
        weight: WEIGHTS.intentions,
        score: this.intentionsScore(me, other),
      },
      {
        criterion: 'stage',
        weight: WEIGHTS.stage,
        score: this.stageScore(me, other),
      },
      {
        criterion: 'lifestyle',
        weight: WEIGHTS.lifestyle,
        score: this.lifestyleScore(me, other),
      },
      {
        criterion: 'interests',
        weight: WEIGHTS.interests,
        score: this.jaccardScore(me.interests, other.interests),
      },
      {
        criterion: 'values',
        weight: WEIGHTS.values,
        score: this.jaccardScore(me.values, other.values),
      },
      {
        criterion: 'location',
        weight: WEIGHTS.location,
        score: this.locationScore(me, other),
      },
      {
        criterion: 'format',
        weight: WEIGHTS.format,
        score: this.formatScore(me, other),
      },
    ];

    const total = Math.round(
      breakdown.reduce(
        (sum, item) => sum + (item.score * item.weight) / 100,
        0,
      ),
    );

    return { total, breakdown };
  }

  /** Пересечение векторов приоритетов: sum(min(wA, wB)) по типам намерений. */
  private intentionsScore(me: UnionMatchInput, other: UnionMatchInput): number {
    if (me.intentions.length === 0 || other.intentions.length === 0)
      return NEUTRAL_SCORE;
    const otherByType = new Map(
      other.intentions.map((i) => [i.type, i.weight]),
    );
    let overlap = 0;
    for (const intention of me.intentions) {
      overlap += Math.min(
        intention.weight,
        otherByType.get(intention.type) ?? 0,
      );
    }
    return Math.min(100, overlap);
  }

  /** Близость этапов по шкале seeker → devotee. */
  private stageScore(me: UnionMatchInput, other: UnionMatchInput): number {
    if (!me.spiritualStage || !other.spiritualStage) return NEUTRAL_SCORE;
    const distance = Math.abs(
      STAGE_ORDER.indexOf(me.spiritualStage) -
        STAGE_ORDER.indexOf(other.spiritualStage),
    );
    return Math.round(100 - (distance / (STAGE_ORDER.length - 1)) * 100);
  }

  /**
   * Образ жизни: питание и регулирующие принципы с равным вкладом.
   * Каждая половина нейтральна, если хотя бы один участник её не заполнил.
   */
  private lifestyleScore(me: UnionMatchInput, other: UnionMatchInput): number {
    return Math.round(
      (this.dietScore(me.diet, other.diet) +
        this.principlesScore(
          me.regulativePrinciples,
          other.regulativePrinciples,
        )) /
        2,
    );
  }

  private dietScore(me: UnionDiet | null, other: UnionDiet | null): number {
    if (!me || !other) return NEUTRAL_SCORE;
    if (me === other) return 100;
    const bothMeatless =
      MEATLESS_DIETS.includes(me) && MEATLESS_DIETS.includes(other);
    // Разное отношение к мясу — самое существенное расхождение в быту.
    return bothMeatless ? 80 : 20;
  }

  /**
   * Доля совпавших принципов от большего из двух наборов: одинаковые наборы
   * дают 100, а «четыре против одного» заметно снижает оценку.
   */
  private principlesScore(
    me: UnionRegulativePrinciple[],
    other: UnionRegulativePrinciple[],
  ): number {
    if (me.length === 0 || other.length === 0) return NEUTRAL_SCORE;
    const mine = new Set(me);
    let shared = 0;
    for (const principle of new Set(other)) {
      if (mine.has(principle)) shared += 1;
    }
    const widest = Math.min(
      TOTAL_PRINCIPLES,
      Math.max(mine.size, new Set(other).size),
    );
    return Math.round((shared / widest) * 100);
  }

  /** Jaccard по строковым массивам; нейтрально, если у кого-то данных нет. */
  private jaccardScore(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return NEUTRAL_SCORE;
    const setA = new Set(a.map((s) => s.trim().toLowerCase()));
    const setB = new Set(b.map((s) => s.trim().toLowerCase()));
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection += 1;
    }
    const union = new Set([...setA, ...setB]).size;
    return union === 0
      ? NEUTRAL_SCORE
      : Math.round((intersection / union) * 100);
  }

  /** Город 100 / страна 50 / иначе 0, бонус 30 за готовность к переезду. */
  private locationScore(me: UnionMatchInput, other: UnionMatchInput): number {
    if (!me.city && !me.country) return NEUTRAL_SCORE;
    if (!other.city && !other.country) return NEUTRAL_SCORE;
    const sameCity =
      me.city &&
      other.city &&
      me.city.trim().toLowerCase() === other.city.trim().toLowerCase();
    if (sameCity) return 100;
    const sameCountry =
      me.country &&
      other.country &&
      me.country.trim().toLowerCase() === other.country.trim().toLowerCase();
    let score = sameCountry ? 50 : 0;
    if (me.relocationReady || other.relocationReady) score += 30;
    return Math.min(100, score);
  }

  /** Совпадение формата общения; 'any' совместим с любым. */
  private formatScore(me: UnionMatchInput, other: UnionMatchInput): number {
    if (me.format === other.format) return 100;
    if (me.format === 'any' || other.format === 'any') return 80;
    return 0;
  }
}
