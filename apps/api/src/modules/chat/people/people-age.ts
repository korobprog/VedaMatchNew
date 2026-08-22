/**
 * Копия `users/age.ts` в объёме, который нужен справочнику: контракт
 * сервисного модуля запрещает импортировать хелперы чужого модуля, а возраст
 * в карточке считается ровно так же, как в профиле портала.
 */
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
