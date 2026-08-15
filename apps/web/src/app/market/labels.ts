import type { FilterLabels } from "@/components/market/listing-filters";

/** Минимум, который нужен от next-intl: и `useTranslations`, и
 *  `getTranslations` возвращают функцию такой формы. */
type Translate = (key: string) => string;

/**
 * Подписи фильтров и навигации. Клиентские компоненты не могут получить `t`
 * целиком — только готовые строки, а страниц каталога четыре, и собирать этот
 * объект в каждой было бы копипастой.
 */
export function filterLabels(t: Translate): FilterLabels {
  return {
    title: t("filters.title"),
    searchPlaceholder: t("search.placeholder"),
    submit: t("search.submit"),
    reset: t("search.reset"),
    kind: t("filters.kind"),
    anyKind: t("filters.anyKind"),
    product: t("filters.product"),
    service: t("filters.service"),
    category: t("filters.category"),
    anyCategory: t("filters.anyCategory"),
    price: t("filters.price"),
    priceFrom: t("filters.priceFrom"),
    priceTo: t("filters.priceTo"),
    condition: t("filters.condition"),
    anyCondition: t("filters.anyCondition"),
    conditions: {
      new_item: t("condition.new_item"),
      like_new: t("condition.like_new"),
      used: t("condition.used"),
      refurbished: t("condition.refurbished"),
    },
    city: t("filters.city"),
    delivery: t("filters.delivery"),
    anyDelivery: t("filters.anyDelivery"),
    deliveries: {
      pickup: t("delivery.pickup"),
      courier: t("delivery.courier"),
      post: t("delivery.post"),
      cdek: t("delivery.cdek"),
      digital: t("delivery.digital"),
      shipping_worldwide: t("delivery.shipping_worldwide"),
    },
    available: t("filters.available"),
    sort: t("filters.sort"),
    sorts: {
      new: t("sort.new"),
      price_asc: t("sort.price_asc"),
      price_desc: t("sort.price_desc"),
      popular: t("sort.popular"),
    },
  };
}

export function navLabels(t: Translate) {
  return {
    catalog: t("nav.catalog"),
    shops: t("nav.shops"),
    favorites: t("nav.favorites"),
    cart: t("cart.title"),
    orders: t("orders.title"),
    chats: t("chat.title"),
    subscriptions: t("subscriptions.title"),
    sell: t("nav.sell"),
    rules: t("nav.rules"),
  };
}
