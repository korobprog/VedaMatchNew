import type { AstroTimeAccuracy } from "./astro";
import type { Gender } from "./index";
import type {
  AstroCompatibilityPurpose,
  GunaMilanScore,
} from "./astro-compatibility";

/**
 * Записи астролога: карты людей, которых он ведёт.
 *
 * Это НЕ пользователи портала и НЕ вторая копия собственной карты владельца.
 * Своя карта живёт отдельно (`AstroBirthData`) и остаётся единственной: на ней
 * держатся персональный день и сверка совместимости, и «которая из списка моя»
 * — вопрос, на который у сервиса не должно быть шанса ответить неверно.
 *
 * Приватность: запись видна только владельцу, не связывается с профилями
 * портала, не участвует в подборе и уходит вместе с аккаунтом. Обмена через
 * записи нет — если человек тоже участник портала, карты сверяются обычным
 * путём, по взаимному согласию.
 */

export interface AstroSubjectPlaceDto {
  label: string;
  latitude: number;
  longitude: number;
}

export interface AstroSubjectDto {
  id: string;
  /** Как владелец назвал человека: ФИО или любая понятная ему пометка. */
  name: string;
  birthDate: string;
  /** null — время неизвестно. */
  birthTime: string | null;
  timeAccuracy: AstroTimeAccuracy;
  /** null — не указан; гана-кута тогда считается по благоприятному варианту. */
  gender: Gender | null;
  place: AstroSubjectPlaceDto;
  timezone: string;
  utcOffsetMinutes: number;
  /** Заметки астролога; пусто, пока не написал. */
  notes: string | null;
  /** Введённого времени в этот день не существовало — переводили стрелки. */
  nonexistentLocalTime: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveAstroSubjectRequest {
  name: string;
  birthDate: string;
  birthTime?: string | null;
  timeAccuracy?: AstroTimeAccuracy;
  gender?: Gender | null;
  place: AstroSubjectPlaceDto;
  /** Ручное переопределение зоны; иначе определяется по координатам. */
  timezone?: string;
  notes?: string | null;
}

export interface AstroSubjectsDto {
  items: AstroSubjectDto[];
}

/** Ограничения полей — общие для формы и для сервера. */
export const ASTRO_SUBJECT_NAME_MAX = 120;
export const ASTRO_SUBJECT_NOTES_MAX = 4000;

/** Кто с кем сверялся — короткая карточка записи. */
export interface AstroSubjectRef {
  id: string;
  name: string;
}

/**
 * Сверка двух записей астролога.
 *
 * Согласия здесь не спрашивают и спрашивать не у кого: обе записи принадлежат
 * тому, кто сверяет. Это его собственные заметки о людях, а не обмен данными
 * между участниками портала — тот идёт своим путём, через запрос и принятие.
 */
export interface AstroSubjectPairDto {
  a: AstroSubjectRef;
  b: AstroSubjectRef;
  purpose: AstroCompatibilityPurpose;
  score: GunaMilanScore;
  /**
   * У одной из записей не указан пол, а гана-кута считается по нему: тогда
   * берётся более благоприятное из двух направлений таблицы, и счёт выходит
   * не ниже настоящего. Сказать об этом обязательно — иначе результат
   * выглядит точнее, чем есть.
   */
  genderUnknown: boolean;
}
