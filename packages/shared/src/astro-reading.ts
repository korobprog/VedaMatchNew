import type { AstroFeatureKey } from './astro';

export type AstroSection =
  | 'overview'
  | 'lagna'
  | 'moon_nakshatra'
  | 'dasha_current'
  | 'career'
  | 'relationships'
  | 'strengths'
  | 'practice';

/** Порядок разделов в интерфейсе: от общего к частному. */
export const ASTRO_SECTIONS: readonly AstroSection[] = Object.freeze([
  'overview',
  'lagna',
  'moon_nakshatra',
  'dasha_current',
  'career',
  'relationships',
  'strengths',
  'practice',
]);

export const ASTRO_SECTION_TITLES: Readonly<Record<AstroSection, string>> =
  Object.freeze({
    overview: 'Общий обзор',
    lagna: 'Лагна и характер',
    moon_nakshatra: 'Накшатра Луны',
    dasha_current: 'Текущий период',
    career: 'Дело и призвание',
    relationships: 'Отношения',
    strengths: 'Сильные стороны',
    practice: 'Духовная практика',
  });

/** Почему раздел недоступен. */
export type AstroSectionBlockReason =
  /** Не хватает данных рождения — нужна конкретная возможность карты. */
  | 'requires_data'
  /** Исчерпана дневная квота пользователя. */
  | 'quota_exhausted'
  /** ИИ выключен: аварийный переключатель или исчерпан общий бюджет. */
  | 'ai_unavailable';

export interface AstroSectionState {
  section: AstroSection;
  title: string;
  /** Текст из кэша; null — ещё не сгенерирован. */
  text: string | null;
  /** Можно ли сгенерировать прямо сейчас. */
  available: boolean;
  blockedBy: AstroSectionBlockReason | null;
  /** Каких возможностей карты не хватает; пусто, если дело не в данных. */
  requires: AstroFeatureKey[];
}

export interface AstroQuotaState {
  /** Сколько разборов ещё можно сгенерировать сегодня. */
  readingsLeft: number;
  readingsPerDay: number;
  /** Работает ли генерация вообще: выключатель и общий бюджет. */
  aiAvailable: boolean;
  /** Общий бюджет исчерпан — сервис в режиме «только расчёт». */
  budgetHalted: boolean;
}

export interface AstroReadingsDto {
  sections: AstroSectionState[];
  quota: AstroQuotaState;
}
