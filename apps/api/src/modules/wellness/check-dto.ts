import type {
  WellnessCheckDto,
  WellnessCheckReason,
  WellnessCheckSource,
  WellnessCheckSourceLevel,
  WellnessCheckStatus,
} from '@vedamatch/shared';

/**
 * Строка автопроверки → то, что видит модератор (VED-384). Источники лежат в
 * JSON-колонке, и доверять её форме нельзя: запись могла сделать прошлая
 * версия сервера. Всё, что не того вида, отбрасывается, а не угадывается.
 */

const LEVELS: WellnessCheckSourceLevel[] = ['verified', 'opened', 'claimed'];

const REASONS = new Set<WellnessCheckReason>([
  'ai_unavailable',
  'ai_failed',
  'ai_unreadable',
  'daily_budget',
  'user_daily_limit',
  'not_found',
  'sources_conflict',
  'too_few_sources',
  'sources_unverified',
  'name_mismatch',
  'composition_unconfirmed',
  'composition_mismatch',
  'catalog_matches_differ',
  'not_food_unconfirmed',
  'not_food',
]);

export function isCheckReason(value: string): value is WellnessCheckReason {
  return REASONS.has(value as WellnessCheckReason);
}

export function parseStoredSources(value: unknown): WellnessCheckSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): WellnessCheckSource[] => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    if (typeof raw.url !== 'string') return [];
    const level = LEVELS.includes(raw.level as WellnessCheckSourceLevel)
      ? (raw.level as WellnessCheckSourceLevel)
      : 'claimed';
    return [
      {
        url: raw.url,
        title: typeof raw.title === 'string' ? raw.title : '',
        confirmsProduct: raw.confirmsProduct === true,
        confirmsIngredients: raw.confirmsIngredients === true,
        level,
        ingredientsOnPage: raw.ingredientsOnPage === true,
      },
    ];
  });
}

export interface CheckRow {
  status: WellnessCheckStatus;
  reasons: string[];
  submittedName: string;
  submittedBrand: string | null;
  submittedIngredients: string;
  aiFound: boolean | null;
  aiNotFood: boolean | null;
  aiName: string | null;
  aiBrand: string | null;
  aiIngredients: string | null;
  aiConflicts: string[];
  sources: unknown;
  attemptCount: number;
  costUsdMicros: number;
  finishedAt: Date | null;
}

export function toCheckDto(row: CheckRow): WellnessCheckDto {
  return {
    status: row.status,
    reasons: row.reasons.filter(isCheckReason),
    submitted: {
      name: row.submittedName,
      brand: row.submittedBrand,
      ingredientsRaw: row.submittedIngredients,
    },
    proposal: {
      found: row.aiFound,
      notFood: row.aiNotFood,
      name: row.aiName,
      brand: row.aiBrand,
      ingredientsRaw: row.aiIngredients,
      conflicts: row.aiConflicts,
    },
    sources: parseStoredSources(row.sources),
    attemptCount: row.attemptCount,
    costUsd: row.costUsdMicros / 1_000_000,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}
