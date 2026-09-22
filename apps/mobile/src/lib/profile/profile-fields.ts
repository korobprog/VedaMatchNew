/**
 * Поля профиля, которые правятся в приложении, и всё, что к ним прилагается:
 * проверка до отправки, сборка тела `PATCH /profile` и правило отображаемого
 * имени.
 *
 * Проверка — та же функция, что на сервере (`findNameError` из
 * `@vedamatch/shared`, её же зовёт `UsersService.updateProfile`), а не своя
 * копия правил: расхождение означало бы форму, которая принимает то, что
 * сервер отобьёт, или наоборот — отказ там, где сервер бы сохранил.
 *
 * Длины (`NAME_MAX_LENGTH`, `STATUS_LINE_MAX_LENGTH`, `ABOUT_MAX_LENGTH`) —
 * тоже из общего пакета.
 *
 * Набор полей — намеренно короткий: имя, духовное имя, статус, рассказ о
 * себе. Это всё, что видно другим сразу — в переписке, в справочнике людей,
 * в общинах — и всё, что правится одним текстовым полем. Город требует
 * геокодера (`/geo/search` + выбор из подсказок), языки — справочника,
 * соцсети и мессенджеры — тринадцати полей с разбором ссылок; они остались
 * на сайте, и экран прямо говорит об этом, а не делает вид, что их нет.
 */

import {
  ABOUT_MAX_LENGTH,
  NAME_MAX_LENGTH,
  STATUS_LINE_MAX_LENGTH,
  findNameError,
  resolveDisplayName,
  type ProfileUpdateRequest,
} from '@vedamatch/shared';

export interface ProfileFormValues {
  name: string;
  spiritualName: string;
  statusLine: string;
  about: string;
}

export type ProfileFieldName = keyof ProfileFormValues;

export interface ProfileFieldError {
  field: ProfileFieldName;
  message: string;
}

/** Часть профиля, из которой форма берёт начальные значения. */
export interface ProfileFormSource {
  name: string;
  spiritualName: string | null;
  statusLine: string | null;
  about: string | null;
}

export const PROFILE_FIELD_LIMITS: Record<ProfileFieldName, number> = {
  name: NAME_MAX_LENGTH,
  spiritualName: NAME_MAX_LENGTH,
  statusLine: STATUS_LINE_MAX_LENGTH,
  about: ABOUT_MAX_LENGTH,
};

export function profileFormValues(profile: ProfileFormSource): ProfileFormValues {
  return {
    name: profile.name,
    spiritualName: profile.spiritualName ?? '',
    statusLine: profile.statusLine ?? '',
    about: profile.about ?? '',
  };
}

/**
 * Имя, под которым человека видят другие. Единственное правило портала на
 * этот счёт (CLAUDE.md, «Имя пользователя наружу»): заполненное духовное имя
 * перекрывает мирское. Считается той же функцией, что и на сервере, — иначе
 * предпросмотр «так вас видят другие» врал бы ровно в том, ради чего он есть.
 */
export function displayNamePreview(values: Pick<ProfileFormValues, 'name' | 'spiritualName'>): string {
  return resolveDisplayName({ name: values.name.trim(), spiritualName: values.spiritualName });
}

/**
 * Статус к отправке: пробелы и переносы схлопываются так же, как их
 * схлопнет сервер (`normalizeStatusLine`). Без этого вставленный из
 * мессенджера статус с переносом считался бы изменением даже после
 * сохранения — сервер вернул бы схлопнутую строку, а форма продолжала бы
 * показывать кнопку «Сохранить» активной.
 */
export function normalizeStatusLineValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Первая ошибка формы или `null`. Порядок — сверху вниз по экрану, чтобы
 * подсветилось то поле, до которого человек дошёл первым.
 *
 * Длина проверяется до `findNameError` только для статуса и рассказа: у
 * имён про длину говорит сама `findNameError`, и дублировать её сообщение
 * своими словами значит завести второй текст на то же правило.
 */
export function findProfileError(values: ProfileFormValues): ProfileFieldError | null {
  const nameError = findNameError(values.name, 'Имя');
  if (nameError) return { field: 'name', message: nameError };

  // Духовное имя необязательно: проверяем только заполненное — пустое поле
  // означает «убрать», как и на сервере.
  const spiritualName = values.spiritualName.trim();
  if (spiritualName) {
    const error = findNameError(spiritualName, 'Духовное имя');
    if (error) return { field: 'spiritualName', message: error };
  }

  if (normalizeStatusLineValue(values.statusLine).length > STATUS_LINE_MAX_LENGTH) {
    return { field: 'statusLine', message: `Статус не длиннее ${STATUS_LINE_MAX_LENGTH} символов` };
  }
  if (values.about.trim().length > ABOUT_MAX_LENGTH) {
    return { field: 'about', message: `Рассказ о себе не длиннее ${ABOUT_MAX_LENGTH} символов` };
  }
  return null;
}

/** Значения, приведённые к тому виду, в котором их сохранит сервер. */
function normalized(values: ProfileFormValues) {
  return {
    name: values.name.trim(),
    spiritualName: values.spiritualName.trim(),
    statusLine: normalizeStatusLineValue(values.statusLine),
    about: values.about.trim(),
  };
}

/**
 * Тело `PATCH /profile` — только изменённые поля.
 *
 * Почему не всё сразу: `updateProfile` смотрит на НАЛИЧИЕ ключа (`'name' in
 * payload`), а не на его значение. Отправить профиль целиком — значит каждый
 * раз перезаписывать поля, которых человек не касался, в том числе стереть
 * духовное имя или рассказ, если форма их почему-то не показала. Пустая
 * строка здесь превращается в `null` ровно там, где сервер считает это
 * «убрать»; у мирского имени такого случая нет — оно обязательно, и пустым
 * его не пропустит `findProfileError`.
 */
export function buildProfileUpdate(values: ProfileFormValues, initial: ProfileFormSource): ProfileUpdateRequest {
  const next = normalized(values);
  const previous = normalized(profileFormValues(initial));
  const update: ProfileUpdateRequest = {};

  if (next.name !== previous.name) update.name = next.name;
  if (next.spiritualName !== previous.spiritualName) update.spiritualName = next.spiritualName || null;
  if (next.statusLine !== previous.statusLine) update.statusLine = next.statusLine || null;
  if (next.about !== previous.about) update.about = next.about || null;

  return update;
}

/** Есть ли что сохранять. Пустое тело `PATCH` — бессмысленный запрос. */
export function hasProfileChanges(values: ProfileFormValues, initial: ProfileFormSource): boolean {
  return Object.keys(buildProfileUpdate(values, initial)).length > 0;
}

/**
 * Сколько символов осталось. Показывается не всегда: счётчик рядом с каждым
 * полем — шум, пока до потолка далеко. Порог в четверть лимита выбран так,
 * чтобы счётчик появлялся, когда до него уже можно дотянуться.
 */
export function remainingChars(value: string, limit: number): number {
  return limit - value.length;
}

export function shouldShowCounter(value: string, limit: number): boolean {
  return remainingChars(value, limit) <= Math.ceil(limit / 4);
}
