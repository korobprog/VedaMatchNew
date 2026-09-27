/**
 * Что показывать на главной — над списком бесед во вкладке «Чаты».
 *
 * Над беседами со временем набрались блоки, нужные не каждому: строка
 * «Быстрая конференция» (VED-360), полоса статусов (VED-129) и полоса
 * блог-ленты (VED-334). Экран «Настройки» (`app/settings.tsx`) даёт каждому
 * свою галочку, а решение «что рисовать» живёт здесь — чистой функцией с
 * тестом, чтобы экран «Чаты» и экран настроек не расходились в умолчаниях.
 *
 * Умолчания. Блог-лента выключена: пользователь попросил убрать её из чатов
 * («она пока лишняя в чате, но чтобы можно было её включить»). Остальное
 * включено — так главная выглядела до настроек.
 *
 * Чего здесь нет намеренно: строка «Запросов на переписку» и плашка ошибки —
 * не блоки, а состояния списка бесед; колокольчик и «Новая» — шапка экрана.
 * Прятать их галочкой значило бы прятать от человека его же переписку.
 */

export type HomeSectionKey = 'quickConference' | 'statuses' | 'blog';

export type HomeSections = Record<HomeSectionKey, boolean>;

export interface HomeSectionInfo {
  key: HomeSectionKey;
  /** Подпись галочки в «Настройках». */
  label: string;
  /** Что именно появится или пропадёт — второй строкой под подписью. */
  note: string;
}

/** Порядок — тот же, в каком блоки стоят на главной сверху вниз. */
export const HOME_SECTIONS: readonly HomeSectionInfo[] = [
  {
    key: 'quickConference',
    label: 'Быстрая конференция',
    note: 'Строка под заголовком: созвон по ссылке до четырёх человек.',
  },
  {
    key: 'statuses',
    label: 'Статусы',
    note: 'Полоса «Мой статус» и статусы собеседников над беседами. Кружки у аватаров в списке остаются.',
  },
  {
    key: 'blog',
    label: 'Блог-лента',
    note: 'Свежие посты портала полосой над беседами. Вся лента всегда открывается из «Сервисов».',
  },
];

export const HOME_SECTIONS_DEFAULT: Readonly<HomeSections> = Object.freeze({
  quickConference: true,
  statuses: true,
  blog: false,
});

const KEYS = HOME_SECTIONS.map((section) => section.key);

/**
 * Разбор сохранённого. Берутся только известные ключи с булевым значением;
 * чего нет или что испорчено — остаётся умолчанием. Так новая галочка,
 * добавленная в следующей сборке, приходит к человеку со своим умолчанием,
 * а не выключенной.
 */
export function parseHomeSections(raw: string | null | undefined): HomeSections {
  const result: HomeSections = { ...HOME_SECTIONS_DEFAULT };
  if (!raw) return result;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return result;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return result;
  for (const key of KEYS) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value === 'boolean') result[key] = value;
  }
  return result;
}

export function serializeHomeSections(sections: HomeSections): string {
  const out: Partial<HomeSections> = {};
  for (const key of KEYS) out[key] = sections[key];
  return JSON.stringify(out);
}

export function withHomeSection(sections: HomeSections, key: HomeSectionKey, shown: boolean): HomeSections {
  return sections[key] === shown ? sections : { ...sections, [key]: shown };
}

/**
 * Какие блоки рисовать на главной и в каком порядке. Статусы требуют
 * профиля — у полосы первым стоит «Мой статус», а без профиля (старт без
 * сети, профиль ещё не пришёл) рисовать его не из чего.
 */
export function shownHomeSections(sections: HomeSections, context: { hasUser: boolean }): HomeSectionKey[] {
  return KEYS.filter((key) => sections[key] && (key !== 'statuses' || context.hasUser));
}
