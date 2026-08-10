/** Насколько точно известно время рождения. */
export type AstroTimeAccuracy = 'exact' | 'approximate' | 'unknown';

export interface AstroPlaceDto {
  /** Человекочитаемое название места, как его выбрал пользователь. */
  label: string;
  latitude: number;
  longitude: number;
}

export interface AstroBirthDataDto {
  /** `YYYY-MM-DD` по месту рождения. */
  birthDate: string;
  /** `HH:mm` по месту рождения; null, когда время неизвестно. */
  birthTime: string | null;
  timeAccuracy: AstroTimeAccuracy;
  place: AstroPlaceDto;
  /** Идентификатор зоны IANA, например `Europe/Moscow`. */
  timezone: string;
  /** Момент рождения в UTC — по нему считается карта. */
  bornAtUtc: string;
  /**
   * Фактическое смещение места в момент рождения, минуты. Показывается
   * пользователю: именно здесь всплывают декретное время СССР и годы до введения
   * часовых поясов, и именно здесь человек может заметить ошибку.
   */
  utcOffsetMinutes: number;
  /**
   * Введённого времени в этот день не существовало — в этот час переводили стрелки
   * вперёд. Карта всё равно считается (в документах действительно может стоять такой
   * час), но интерфейс обязан предупредить и предложить уточнить.
   */
  nonexistentLocalTime: boolean;
}

export interface SaveAstroBirthDataRequest {
  birthDate: string;
  birthTime?: string | null;
  timeAccuracy: AstroTimeAccuracy;
  place: AstroPlaceDto;
  /** Ручное переопределение зоны — на случай приграничных мест. */
  timezone?: string;
}

/** Поля, из которых складывается прогресс заполнения. */
export type AstroBirthFieldKey = 'birthDate' | 'birthPlace' | 'birthTime';

/** Что именно открывается по мере заполнения. */
export type AstroFeatureKey =
  | 'graha_signs'
  | 'moon_nakshatra'
  | 'dasha'
  | 'lagna'
  | 'houses'
  | 'daily_transits';

export interface AstroCompletenessItem {
  key: AstroBirthFieldKey;
  weight: number;
  filled: boolean;
}

export interface AstroFeatureState {
  key: AstroFeatureKey;
  unlocked: boolean;
  /** Каких полей не хватает, чтобы открыть. Пусто, когда уже открыто. */
  requires: AstroBirthFieldKey[];
}

export interface AstroCompleteness {
  percent: number;
  items: AstroCompletenessItem[];
  missing: AstroBirthFieldKey[];
  /** Следующее поле, которое стоит предложить заполнить. */
  next: AstroBirthFieldKey | null;
  features: AstroFeatureState[];
}

export interface AstroStateDto {
  birthData: AstroBirthDataDto | null;
  /**
   * Дата рождения из портального профиля, если она там уже есть. Позволяет
   * онбордингу начаться с заполненного поля, а не с пустого экрана.
   */
  suggestedBirthDate: string | null;
  completeness: AstroCompleteness;
}
