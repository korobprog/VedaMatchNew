/**
 * Что администратор изменил в портальном профиле. Список нужен дважды —
 * журналу действий и уведомлению человеку, — поэтому считается один раз и
 * отдельно от Nest: сравнение снимков «до» и «после» тестируется без базы.
 */

export const EDITABLE_PROFILE_FIELDS = [
  'name',
  'spiritualName',
  'birthDate',
  'gender',
  'about',
  // Статус правится администрацией на тех же основаниях, что и рассказ о
  // себе: это голос человека, но им можно навредить, и убрать оскорбление
  // должно быть чем. Правка попадает в журнал и в уведомление человеку.
  'statusLine',
  // Линию администрация правит по просьбе человека или по итогам проверки
  // наставником: она определяет, что ему показывают Образование и Музыка.
  'lineage',
  'languages',
  'homeLocation',
  'socialLinks',
  'messengers',
] as const;

export type EditableProfileField = (typeof EDITABLE_PROFILE_FIELDS)[number];

export type ProfileSnapshot = Partial<Record<EditableProfileField, unknown>>;

/**
 * Поля, отличающиеся в двух снимках профиля. Порядок — как в
 * `EDITABLE_PROFILE_FIELDS`: журнал и уведомление перечисляют изменения
 * одинаково, а не в порядке, в котором их прислала форма.
 */
export function changedProfileFields(
  before: ProfileSnapshot,
  after: ProfileSnapshot,
): EditableProfileField[] {
  return EDITABLE_PROFILE_FIELDS.filter(
    (field) => !isSameValue(before[field], after[field]),
  );
}

/**
 * Пустая строка и null для профиля — одно и то же («поле не заполнено»), см.
 * `UsersService.updateProfile`. Без этого очистка уже пустого поля считалась
 * бы изменением и слала человеку уведомление ни о чём.
 */
function isSameValue(a: unknown, b: unknown): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (left === null || right === null) return left === right;
  return stableKey(left) === stableKey(right);
}

function normalize(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  return value;
}

/**
 * Порядок ключей в объекте не значит ничего: `{city, lat}` и `{lat, city}` —
 * один и тот же город, а прямой `JSON.stringify` объявил бы их разными.
 */
function stableKey(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableKey(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableKey(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
