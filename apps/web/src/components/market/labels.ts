import type { ListingGridLabels } from "./listing-grid";

/**
 * Минимум, который нужен от next-intl: и `useTranslations`, и `getTranslations`
 * возвращают функцию с методом `raw`.
 *
 * `t(key)` на сообщении с плейсхолдером (`{count}`) не отдаёт строку — next-intl
 * ждёт значения и без них возвращает сам ключ. Клиентским компонентам мы
 * передаём готовые строки, а подстановку делают они сами, поэтому шаблоны
 * забираем через `t.raw`.
 */
export interface Translate {
  (key: string): string;
  raw: (key: string) => unknown;
}

/** Шаблон с плейсхолдерами — забираем сырым, подставим на месте. */
export function template(t: Translate, key: string): string {
  return String(t.raw(key));
}

/**
 * Подписи для ленты объявлений. Собраны в одном месте, потому что одну и ту же
 * сетку показывают каталог, витрина магазина и избранное, а серверные
 * компоненты не могут передать в клиентский `t` целиком — только строки.
 */
export function listingGridLabels(t: Translate): ListingGridLabels {
  return {
    negotiable: t("price.negotiable"),
    free: t("price.free"),
    from: template(t, "price.from"),
    range: template(t, "price.range"),
    addToFavorites: t("favorites.add"),
    removeFromFavorites: t("favorites.remove"),
    soldOut: t("listing.soldOut"),
    unavailable: t("listing.unavailable"),
    kindService: t("listing.kindService"),
    empty: t("listing.empty"),
    emptyHint: t("listing.emptyHint"),
    loadMore: t("listing.loadMore"),
    total: template(t, "listing.total"),
  };
}

/** Подписи цены для карточек и страницы объявления. */
export function priceLabels(t: Translate) {
  return {
    negotiable: t("price.negotiable"),
    free: t("price.free"),
    from: template(t, "price.from"),
    range: template(t, "price.range"),
  };
}

/** Подписи шапки магазина и карточки в справочнике. */
export function shopLabels(t: Translate) {
  return {
    listings: template(t, "shop.listingsCount"),
    reviews: template(t, "shop.reviews"),
    since: template(t, "shop.since"),
    closed: t("shop.closed"),
    edit: t("sell.edit"),
    contacts: t("shop.contacts"),
  };
}
