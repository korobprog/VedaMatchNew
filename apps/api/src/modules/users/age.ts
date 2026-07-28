export const MIN_PROFILE_AGE = 18;
export const MAX_PROFILE_AGE = 120;

/** Полных лет на текущую дату; null, если дата рождения не указана. */
export function calculateAge(
  birthDate: Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!birthDate) return null;

  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  const beforeBirthday =
    monthDiff < 0 ||
    (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;

  return age;
}

/** `YYYY-MM-DD` для форм; время не хранится и не отдаётся. */
export function toBirthDateInput(birthDate: Date | null): string | null {
  return birthDate ? birthDate.toISOString().slice(0, 10) : null;
}

/**
 * Разбирает `YYYY-MM-DD` из формы профиля. Возвращает Date, null (очистка поля)
 * или строку с ошибкой, которую контроллер превращает в 400.
 */
export function parseBirthDate(
  value: string | null | undefined,
): Date | null | { error: string } {
  if (value == null || value.trim() === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return { error: 'Дата рождения должна быть в формате ГГГГ-ММ-ДД' };
  }

  const parsed = new Date(`${value.trim()}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { error: 'Некорректная дата рождения' };
  }

  const age = calculateAge(parsed);
  if (age === null || age < MIN_PROFILE_AGE) {
    return { error: `Знакомства доступны с ${MIN_PROFILE_AGE} лет` };
  }
  if (age > MAX_PROFILE_AGE) {
    return { error: 'Проверьте дату рождения' };
  }

  return parsed;
}
