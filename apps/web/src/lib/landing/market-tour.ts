import type { MarketListingSummary } from "@vedamatch/shared";

/**
 * Ролик витрины Рынка: палец обходит объявления и открывает карточку — на
 * публичной странице сервиса до этого не было ни одного живого экрана, и
 * по одному списку возможностей нельзя было понять, что площадка работает.
 *
 * Своя маленькая машина фаз, а не общая с Астрологией: там палец бьёт по
 * кнопке и остаётся на том же экране, здесь карточка открывается и
 * закрывается — это лишняя фаза, из-за которой общий автомат пришлось бы
 * обвешивать условиями.
 */

export type MarketPhase = "browsing" | "press" | "opened" | "closing";

export interface MarketTourState {
  index: number;
  phase: MarketPhase;
}

export const MARKET_TOUR_START: MarketTourState = {
  index: 0,
  phase: "browsing",
};

export const MARKET_DURATIONS: Record<MarketPhase, number> = {
  browsing: 1800,
  press: 280,
  opened: 2600,
  closing: 600,
};

export const MARKET_CURSOR_TRAVEL = 620;

const ORDER: MarketPhase[] = ["browsing", "press", "opened", "closing"];

export function nextMarketState(
  state: MarketTourState,
  count: number,
): MarketTourState {
  const at = ORDER.indexOf(state.phase);
  if (at < ORDER.length - 1) {
    return { index: state.index, phase: ORDER[at + 1] };
  }
  return { index: count > 0 ? (state.index + 1) % count : 0, phase: "browsing" };
}

export function isMarketPressing(phase: MarketPhase): boolean {
  return phase === "press";
}

/** Карточка раскрыта: нажатие уже случилось, закрытие ещё нет. */
export function isListingOpen(phase: MarketPhase): boolean {
  return phase === "opened";
}

/** Что рассказываем под макетом на каждой фазе. */
export function marketCaption(phase: MarketPhase): string {
  return phase === "opened" || phase === "closing"
    ? "В карточке — цена, город и магазин продавца. Оттуда же заказ и переписка"
    : "Витрина общины: товары и услуги от преданных, с поиском по разделам";
}

/**
 * Что показывать в макете.
 *
 * Настоящие объявления с площадки, если они есть: витрина, показывающая
 * выдуманные товары, ровно ничего не доказывает — а вопрос у гостя именно
 * «работает ли магазин». Запасные карточки нужны на случай, когда API
 * недоступен или на площадке пока пусто: страница сервиса обязана
 * открыться и в этом случае.
 *
 * Четыре, а не «сколько дадут»: плитка витрины 128px, в рамке макета 268px,
 * то есть помещается ровно два ряда по две. Пятая карточка обрезалась бы
 * рамкой, а палец всё равно уезжал бы к ней — за нижний край экрана.
 */
export const MARKET_SHOWCASE_LIMIT = 4;

export interface MarketShowcaseCard {
  id: string;
  title: string;
  price: string;
  city: string | null;
  shopName: string;
  imageUrl: string | null;
  /** Запасная карточка: показываем её иначе — без обещания живого товара. */
  demo: boolean;
}

const CURRENCY_SIGN: Record<string, string> = {
  rub: "₽",
  usd: "$",
  eur: "€",
  inr: "₹",
};

/**
 * Цена из минорных единиц.
 *
 * Пробелы записаны escape-последовательностями намеренно: `toLocaleString`
 * сам ставит узкий неразрывный U+202F, и на глаз он неотличим от обычного —
 * первая же версия этой функции срезала регуляркой и его, и отбивку перед
 * знаком валюты, а тест падал на строках, выглядящих одинаково.
 *
 * Разряды — узким неразрывным, знак валюты — обычным неразрывным: иначе
 * «29 000 ₽» рвётся пополам в узкой карточке макета.
 */
export function formatShowcasePrice(price: {
  mode: string;
  minor: number | null;
  currency: string;
}): string {
  if (price.mode === "free") return "Даром";
  if (price.mode === "negotiable" || price.minor === null) return "Договорная";
  const major = Math.round(price.minor / 100);
  const sign = CURRENCY_SIGN[price.currency] ?? price.currency.toUpperCase();
  const разряды = major
    .toLocaleString("ru-RU")
    .replace(/[\s\u00a0\u202f]/g, "\u202f");
  return `${разряды}\u00a0${sign}`;
}

/**
 * Запасные карточки. Цены идут через тот же `formatShowcasePrice`, а не
 * записаны строками: разделитель разрядов — невидимый символ, и вписанный
 * руками он разошёлся бы с настоящими объявлениями, чего никто бы не заметил.
 */
export const MARKET_DEMO_CARDS: MarketShowcaseCard[] = [
  {
    id: "demo-books",
    title: "«Бхагавад-гита как она есть», подарочное издание",
    price: formatShowcasePrice({ mode: "fixed", minor: 120000, currency: "rub" }),
    city: "Москва",
    shopName: "Лавка при храме",
    imageUrl: null,
    demo: true,
  },
  {
    id: "demo-mala",
    title: "Джапа-мала из туласи, ручная работа",
    price: formatShowcasePrice({ mode: "fixed", minor: 240000, currency: "rub" }),
    city: "Санкт-Петербург",
    shopName: "Мастерская «Туласи»",
    imageUrl: null,
    demo: true,
  },
  {
    id: "demo-prasad",
    title: "Ладду и бурфи к празднику, на заказ",
    price: formatShowcasePrice({ mode: "negotiable", minor: null, currency: "rub" }),
    city: "Новосибирск",
    shopName: "Кухня Радхики",
    imageUrl: null,
    demo: true,
  },
];

/** Настоящие объявления, а если их нет — запасные. */
export function showcaseCards(
  items: MarketListingSummary[] | null | undefined,
): MarketShowcaseCard[] {
  const real = (items ?? [])
    .filter((item) => item.titleRu || item.titleEn)
    .slice(0, MARKET_SHOWCASE_LIMIT)
    .map<MarketShowcaseCard>((item) => ({
      id: item.id,
      title: (item.titleRu || item.titleEn) as string,
      price: formatShowcasePrice(item.price),
      city: item.city,
      shopName: item.shop.name,
      imageUrl: item.primaryImageUrl,
      demo: false,
    }));
  return real.length > 0 ? real : MARKET_DEMO_CARDS;
}
