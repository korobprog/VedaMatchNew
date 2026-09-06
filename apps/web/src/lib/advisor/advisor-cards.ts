/**
 * Советник на главной: что портал говорит человеку вместо строки приветствия.
 *
 * Делит работу с двумя уже существующими поверхностями, и границы важны —
 * иначе одна и та же цифра окажется на экране трижды:
 *
 * - колокольчик показывает СОБЫТИЯ и только пока они не прочитаны
 *   (`NotificationItemDto` удаляется после прочтения, это список
 *   непрочитанного, а не архив);
 * - виджет на карточке Знакомств показывает ОДИН сервис.
 *
 * Советнику остаётся то, чего не видит ни тот, ни другой: состояние человека
 * целиком. Подвисшее дело, у которого событие было неделю назад и из
 * колокольчика давно ушло. Пробел в профиле, который ломает не тот сервис,
 * где он находится. Функция, до которой человек не дошёл.
 *
 * Функция чистая и принимает уже собранные сигналы, как
 * `buildUnionQuickAccessData`: каждый источник на главной обёрнут в
 * `.catch(() => null)`, поэтому здесь всё необязательное. Упавший запрос
 * убирает свою карточку, а не весь советник.
 */
import { plural } from "@/lib/plural";

/**
 * Три вида разговора. Влияют и на цвет, и на порядок: незакрытое дело
 * всегда важнее пробела, пробел важнее предложения попробовать.
 */
export type AdvisorTone = "todo" | "gap" | "discover";

export interface AdvisorCard {
  /**
   * Стабильный ключ. По нему карточка скрывается на неделю, поэтому он не
   * должен зависеть от изменчивых данных: `notice-expiring`, а не
   * `notice-expiring-<id>` — иначе скрытие слетит на следующем объявлении.
   */
  id: string;
  tone: AdvisorTone;
  /** Slug сервиса для иконки. null — карточка портального профиля. */
  service: string | null;
  text: string;
  /**
   * Не гасить первую букву при обращении по имени.
   *
   * Обычно «Марина, » склеивается со строчной: «Марина, объявление…». Но
   * текст, начинающийся с имени собственного, так портится — «Сита,
   * джйотиш ничего не рассчитает». Флаг явный, а не по догадке о заглавных:
   * угадать имя собственное регуляркой нельзя, а следующая карточка,
   * начинающаяся с «Рынок» или с цитаты, наступит на те же грабли молча.
   */
  keepFirstCase?: boolean;
  actionLabel: string;
  href: string;
  /** Больше — раньше. Сравнивается только внутри одной выдачи. */
  weight: number;
}

/** Сколько карточек показываем за раз. */
export const ADVISOR_LIMIT = 3;

/** За сколько дней до конца срока объявление считается протухающим. */
const EXPIRY_WARNING_DAYS = 3;

/** Сколько дней отклик может висеть без ответа, прежде чем о нём напомнить. */
const RESPONSE_SILENCE_DAYS = 5;

export interface AdvisorInput {
  /** Указан ли город в портальном профиле. */
  hasHomeLocation: boolean;
  /** Преданный без духовной линии в профиле — см. `needsLineageChoice`. */
  needsLineage: boolean;

  /** 0..100, null — анкета Знакомств недоступна. */
  unionProfilePercent: number | null;
  /** Входящие симпатии, на которые не ответили. */
  unionIncomingLikes: number;

  /** 0..100 заполненности данных рождения, null — Астрология недоступна. */
  astroPercent: number | null;
  /** Готовая фраза персонального дня, null — не сгенерирована. */
  astroTodayText: string | null;

  /** Моё объявление, у которого ближе всего срок. */
  expiringNotice: { title: string; daysLeft: number } | null;
  /** Сколько всего объявлений я публиковал. 0 — доску ещё не пробовал. */
  myNoticesTotal: number | null;
  /** Мой отклик, который дольше всех висит без ответа. */
  silentResponse: { noticeTitle: string; daysWaiting: number } | null;

  /** Сколько общин подтвердило моё участие. null — список недоступен. */
  communityCount: number | null;
}

/** Обрезка заголовка: в карточку помещается строка, а не абзац. */
function short(text: string, limit = 40) {
  const trimmed = text.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1)}…`;
}

function todoCards(input: AdvisorInput): AdvisorCard[] {
  const cards: AdvisorCard[] = [];

  // Порог живёт здесь, а не в сборщике сигналов: сборщик отдаёт ближайшее по
  // сроку объявление каким бы дальним оно ни было, а решение «пора ли об
  // этом говорить» — политика советника.
  if (input.expiringNotice && input.expiringNotice.daysLeft <= EXPIRY_WARNING_DAYS) {
    const { title, daysLeft } = input.expiringNotice;
    const expired = daysLeft <= 0;
    cards.push({
      id: "notice-expiring",
      tone: "todo",
      service: "notices",
      // Разные формулировки, а не одна с числом: «протухнет через 0 дней»
      // человек прочитает как ошибку, и будет прав.
      text: expired
        ? `Объявление «${short(title)}» сняли по сроку — его можно вернуть на доску`
        : `Объявление «${short(title)}» протухнет через ${daysLeft} ${plural(daysLeft, "день", "дня", "дней")}`,
      actionLabel: expired ? "Вернуть" : "Продлить",
      href: "/notices/my",
      weight: expired ? 100 : 95,
    });
  }

  if (input.unionIncomingLikes > 0) {
    const n = input.unionIncomingLikes;
    cards.push({
      id: "union-incoming",
      tone: "todo",
      service: "union",
      text: `${n} ${plural(n, "человек ждёт", "человека ждут", "человек ждут")} вашего ответа в Знакомствах`,
      actionLabel: "Ответить",
      href: "/union",
      weight: 90,
    });
  }

  if (
    input.silentResponse &&
    input.silentResponse.daysWaiting >= RESPONSE_SILENCE_DAYS
  ) {
    const { noticeTitle, daysWaiting } = input.silentResponse;
    cards.push({
      id: "notice-response-silent",
      tone: "todo",
      service: "notices",
      text: `На ваш отклик «${short(noticeTitle)}» не ответили ${daysWaiting} ${plural(daysWaiting, "день", "дня", "дней")}`,
      actionLabel: "Посмотреть",
      href: "/notices/responses",
      weight: 70,
    });
  }

  return cards;
}

/**
 * Пробелы называются вместе с последствием, а не сами по себе. «Заполните
 * профиль» человек читал сто раз и научился не видеть; «без города доска не
 * покажет, что рядом» — это причина, по которой он сейчас чего-то не
 * получает.
 */
function gapCards(input: AdvisorInput): AdvisorCard[] {
  const cards: AdvisorCard[] = [];

  if (!input.hasHomeLocation) {
    cards.push({
      id: "profile-city",
      tone: "gap",
      service: null,
      text: "Без города Объявления и справочник людей не покажут, что происходит рядом с вами",
      actionLabel: "Указать город",
      // Якорь обязателен: профиль длиной в пять экранов, и без него плашка
      // высаживает человека на самом верху, далеко от поля города.
      href: "/profile#city",
      weight: 60,
    });
  }

  if (input.needsLineage) {
    cards.push({
      id: "profile-lineage",
      tone: "gap",
      service: null,
      text: "Линия не указана — Образование и Музыка показывают всё подряд, а не материалы вашей традиции",
      actionLabel: "Указать линию",
      href: "/profile#lineage",
      // Чуть ниже города: город ломает два сервиса для всех, линия — два
      // сервиса для преданных.
      weight: 58,
    });
  }

  if (input.unionProfilePercent !== null && input.unionProfilePercent < 100) {
    cards.push({
      id: "union-profile",
      tone: "gap",
      service: "union",
      // «Анкета» без уточнения читается как только что пройденная
      // самоидентификация — называем сервис, к которому она относится.
      text: `Анкета Знакомств заполнена на ${input.unionProfilePercent}% — чем полнее, тем чаще вас показывают`,
      actionLabel: "Дополнить",
      href: "/union/profile",
      weight: 50,
    });
  }

  if (input.astroPercent !== null && input.astroPercent < 100) {
    cards.push({
      id: "astro-birth-data",
      tone: "gap",
      service: "astro",
      text: "Астрология ничего не рассчитает, пока нет точного времени и места рождения",
      keepFirstCase: true,
      actionLabel: "Заполнить",
      href: "/astro",
      weight: 45,
    });
  }

  if (input.communityCount === 0) {
    cards.push({
      id: "community-missing",
      tone: "gap",
      service: "notices",
      text: "Община не указана — значок ятры не виден ни в Знакомствах, ни на доске",
      actionLabel: "Найти свою",
      href: "/communities",
      weight: 40,
    });
  }

  return cards;
}

/**
 * Открытие считается косвенно: «нет ни одного вашего объявления» ≈ «доску не
 * пробовал». Портал не ведёт учёта заходов, поэтому отличить того, кто не
 * знает о доске, от того, кто зашёл и решил, что она не нужна, нечем. Отсюда
 * низкий вес и мягкая формулировка: это приглашение, а не упрёк.
 */
function discoverCards(input: AdvisorInput): AdvisorCard[] {
  const cards: AdvisorCard[] = [];

  if (input.myNoticesTotal === 0) {
    cards.push({
      id: "notices-first",
      tone: "discover",
      service: "notices",
      text: "На доске общины можно отдать даром, попросить помощи или позвать на программу",
      actionLabel: "Написать",
      href: "/notices/new",
      weight: 20,
    });
  }

  if (input.astroTodayText) {
    cards.push({
      id: "astro-today",
      tone: "discover",
      service: "astro",
      text: short(input.astroTodayText, 120),
      // Фраза приходит из генерации и может начинаться с чего угодно —
      // хоть с «Луна», хоть с названия накшатры.
      keepFirstCase: true,
      actionLabel: "Персональный день",
      href: "/astro",
      // Самый низкий вес: это не дело и не пробел, а то, чем советник
      // заполняет тишину, когда у человека всё в порядке.
      weight: 5,
    });
  }

  return cards;
}

/** Собирает и ранжирует карточки. Обращение по имени добавляется отдельно. */
export function buildAdvisorCards(
  input: AdvisorInput,
  limit = ADVISOR_LIMIT,
): AdvisorCard[] {
  return [...todoCards(input), ...gapCards(input), ...discoverCards(input)]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

/**
 * Обращение по имени — только в первую карточку: человек должен понять, что
 * портал говорит с ним, но не читать своё имя трижды подряд.
 *
 * Отдельно от сборки, потому что применять его нужно ПОСЛЕ отсева скрытых, а
 * скрытие живёт на клиенте: вшив имя на сервере, мы бы теряли обращение
 * каждый раз, когда человек прячет верхнюю карточку.
 */
export function greetFirst(
  cards: AdvisorCard[],
  displayName: string,
): AdvisorCard[] {
  const name = displayName.trim();
  if (!cards.length || !name) return cards;

  const [first, ...rest] = cards;
  const body = first.keepFirstCase
    ? first.text
    : `${first.text.charAt(0).toLowerCase()}${first.text.slice(1)}`;
  return [{ ...first, text: `${name}, ${body}` }, ...rest];
}
