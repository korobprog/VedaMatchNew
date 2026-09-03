import type { Gender } from '@prisma/client';

/**
 * Поля `User`, которые уезжают в московскую базу.
 *
 * **Единственное место, где записан состав контура.** Спецификация называет
 * его открытым вопросом к юристу, и ответ должен быть правкой здесь, а не
 * поиском по коду. Граница проходит по «идентифицирует человека», а не по
 * «принадлежит человеку»: рассказ о себе, языки, анкета Знакомств, чаты и
 * покупки остаются в амстердамской базе.
 */
export const PERSONAL_FIELDS = [
  'id',
  'email',
  'name',
  'spiritualName',
  'birthDate',
  'gender',
  'avatarKey',
] as const;

export type PersonalField = (typeof PERSONAL_FIELDS)[number];

/** То, что нужно прочитать из `User`, чтобы собрать персональную запись. */
export type PersonalUserSource = {
  id: string;
  email: string;
  name: string;
  spiritualName: string | null;
  birthDate: Date | null;
  gender: Gender | null;
  avatarKey: string | null;
};

/** Данные рождения — идентифицирующие сведения, поэтому тоже в контуре. */
export type PersonalBirthSource = {
  bornAtUtc: Date;
  birthDateLocal: Date;
  birthTimeLocal: string | null;
  placeLabel: string;
  latitude: number;
  longitude: number;
  timeZone: string;
};

export type PersonalRecordInput = {
  id: string;
  email: string;
  name: string;
  spiritualName: string | null;
  birthDate: Date | null;
  /**
   * Строкой, а не энумом: в московской схеме энума нет, иначе его пришлось бы
   * держать синхронно в двух схемах. Значение приходит сюда уже проверенным.
   */
  gender: string | null;
  avatarKey: string | null;
  photoKeys: string[];
};

/**
 * `User` + ключи фотографий → персональная запись. Чистая функция: собирает
 * только перечисленные поля, всё прочее отбрасывает молча — так расширение
 * `User` не выносит новые данные за контур само собой.
 */
export function toPersonalRecord(
  user: PersonalUserSource,
  photoKeys: readonly string[],
): PersonalRecordInput {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    spiritualName: user.spiritualName,
    birthDate: user.birthDate,
    gender: user.gender === null ? null : String(user.gender),
    avatarKey: user.avatarKey,
    photoKeys: [...photoKeys],
  };
}

/** Prisma-`select` под `toPersonalRecord`, чтобы перечень не разъезжался. */
export const PERSONAL_SELECT = Object.fromEntries(
  PERSONAL_FIELDS.map((field) => [field, true]),
) as Record<PersonalField, true>;
