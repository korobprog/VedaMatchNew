"use client";

import { createContext, useCallback, useContext } from "react";
import { serviceCardName, type ServiceCard } from "@vedamatch/shared";
import { useLocale } from "next-intl";

/**
 * Публичный каталог сервисов, разложенный по слагам. Живёт в корневом layout,
 * чтобы имя сервиса бралось из одного места и на лендинге, и в шапке, и в
 * сетке портала: иначе правка названия в админке доезжает не везде.
 *
 * Пустая карта — нормальное состояние: если API недоступен, лендинг всё равно
 * рисуется, просто с запасными названиями из кода.
 */
const ServiceCatalogContext = createContext<Map<string, ServiceCard>>(
  new Map(),
);

export function ServiceCatalogProvider({
  services,
  children,
}: {
  services: ServiceCard[];
  children: React.ReactNode;
}) {
  const catalog = new Map(services.map((service) => [service.slug, service]));
  return (
    <ServiceCatalogContext.Provider value={catalog}>
      {children}
    </ServiceCatalogContext.Provider>
  );
}

export function useServiceCatalog(): Map<string, ServiceCard> {
  return useContext(ServiceCatalogContext);
}

/**
 * Функция «имя сервиса по слагу» для текущей локали. Хук отдаёт именно
 * функцию, а не готовую строку: имена берут внутри `.map()` по списку
 * сервисов, а звать хук в цикле нельзя.
 *
 * `fallback` — имя из service-content.ts. Оно остаётся на случай, когда
 * карточки нет в каталоге (сервис выключен или API не ответил), чтобы
 * страница не показывала пустоту.
 */
export function useServiceNames(): (slug: string, fallback: string) => string {
  const catalog = useServiceCatalog();
  const locale = useLocale();
  // useCallback, а не просто замыкание: функцию кладут в зависимости useMemo
  // в шапке, и новая ссылка на каждый рендер сбрасывала бы там мемоизацию.
  return useCallback(
    (slug: string, fallback: string) => {
      const service = catalog.get(slug);
      return service ? serviceCardName(service, locale) : fallback;
    },
    [catalog, locale],
  );
}
