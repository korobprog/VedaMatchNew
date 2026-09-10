import type { Prisma } from '@prisma/client';

/**
 * Кому какие сервисы видны в сетке портала.
 *
 * Вынесено отдельно и покрыто тестом ради одного правила: выключенный сервис
 * не показывается никому, включая администратора. Сетка портала — это то, чем
 * человек пользуется, а не панель управления; у админки свой запрос. Раньше
 * администратору каталог отдавался вовсе без условий, и на его главной висела
 * карточка выключенного служебного раздела — нажать нечего, убрать нечем.
 */
export function buildCatalogFilter(input: {
  isAdmin: boolean;
  userId: string;
  stageFilters: Prisma.ServiceWhereInput[];
}): Prisma.ServiceWhereInput {
  const notDisabled: Prisma.ServiceWhereInput = {
    status: { not: 'disabled' },
  };
  if (input.isAdmin) return notDisabled;
  return {
    ...notDisabled,
    // Администратор видит и непубличные, и «скоро»: ему они нужны, чтобы
    // проверить сервис до открытия. Остальным — публичные, выданные лично и
    // подходящие по духовному этапу.
    OR: [
      { public: true },
      { access: { some: { userId: input.userId } } },
      ...input.stageFilters,
    ],
  };
}
