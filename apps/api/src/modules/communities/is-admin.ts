import type { AccessTokenPayload } from '@vedamatch/shared';

// Копия market/is-admin.ts. Общего портального хелпера для этого нет, а
// заводить его отдельной задачей ради трёх строк — не повод трогать чужие
// модули; расхождение ловится тестом.
export function isAdmin(user: AccessTokenPayload): boolean {
  return user.role === 'admin' || user.role === 'service-admin';
}
