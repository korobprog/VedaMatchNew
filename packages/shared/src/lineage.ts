import type { SpiritualStage } from './index';

/**
 * Духовная линия преданного: общество, матх или паривар, к которому он
 * принадлежит.
 *
 * Зачем это порталу. У разных линий разные наставники, стандарты и корпус
 * материалов, и лекция или бхаджан, естественные для одной, в другой читаются
 * как чужие. Поэтому каждый материал Образования и каждая запись Музыки
 * подписаны линией, а преданный видит по умолчанию своё — без пересечений и
 * без необходимости фильтровать вручную.
 *
 * Только для преданных. Ищущий, практикующий и йог линию не выбирают и видят
 * весь каталог: к ним это деление не относится.
 *
 * Справочник — константа, а не таблица: список меняется раз в годы, и
 * админский экран ради него избыточен. Зато в базе линия хранится строкой, а
 * не enum'ом Postgres, поэтому новая строка здесь — это правка одного файла
 * без миграции. Старые значения не удалять и не переименовывать: они уже
 * записаны у людей и у материалов.
 */
export type LineageGroup = 'iskcon' | 'gaudiya_math' | 'parivara';

export type LineageId =
  | 'iskcon'
  | 'sri_chaitanya_gaudiya_math'
  | 'sri_chaitanya_saraswat_math'
  | 'sri_gopinath_gaudiya_math'
  | 'ipbys'
  | 'nityananda_vamsha'
  | 'advaita_vamsha'
  | 'gadadhara_parivara'
  | 'narottama_parivara'
  | 'shyamananda_parivara';

export interface LineageOption {
  id: LineageId;
  group: LineageGroup;
  /** Полное название — в списках выбора и в профиле. */
  label: string;
  /** Короткое — в чипах на карточках, где полное не помещается. */
  shortLabel: string;
  /** Расшифровка аббревиатуры, если она есть. */
  hint?: string;
}

export const LINEAGE_GROUP_LABELS: Record<LineageGroup, string> = {
  iskcon: 'ISKCON',
  gaudiya_math: 'Гаудия-матх',
  parivara: 'Паривары',
};

/** Порядок групп и строк внутри них — это порядок в списках выбора. */
export const LINEAGES: readonly LineageOption[] = [
  {
    id: 'iskcon',
    group: 'iskcon',
    label: 'ISKCON',
    shortLabel: 'ISKCON',
    hint: 'Международное общество сознания Кришны',
  },
  {
    id: 'sri_chaitanya_gaudiya_math',
    group: 'gaudiya_math',
    label: 'Шри Чайтанья Гаудия Матх',
    shortLabel: 'Чайтанья Гаудия Матх',
  },
  {
    id: 'sri_chaitanya_saraswat_math',
    group: 'gaudiya_math',
    label: 'Шри Чайтанья Сарасват Матх',
    shortLabel: 'Сарасват Матх',
  },
  {
    id: 'sri_gopinath_gaudiya_math',
    group: 'gaudiya_math',
    label: 'Шри Гопинатх Гаудия Матх',
    shortLabel: 'Гопинатх Гаудия Матх',
  },
  {
    id: 'ipbys',
    group: 'gaudiya_math',
    label: 'IPBYS',
    shortLabel: 'IPBYS',
    hint: 'Международное общество чистой бхакти-йоги',
  },
  {
    id: 'nityananda_vamsha',
    group: 'parivara',
    label: 'Нитьянанда-вамша',
    shortLabel: 'Нитьянанда-вамша',
  },
  {
    id: 'advaita_vamsha',
    group: 'parivara',
    label: 'Адвайта-вамша',
    shortLabel: 'Адвайта-вамша',
  },
  {
    id: 'gadadhara_parivara',
    group: 'parivara',
    label: 'Гададхара-паривара',
    shortLabel: 'Гададхара-паривара',
  },
  {
    id: 'narottama_parivara',
    group: 'parivara',
    label: 'Нароттама-паривара',
    shortLabel: 'Нароттама-паривара',
  },
  {
    id: 'shyamananda_parivara',
    group: 'parivara',
    label: 'Шьямананда-паривара',
    shortLabel: 'Шьямананда-паривара',
  },
];

export const LINEAGE_IDS: readonly LineageId[] = LINEAGES.map((item) => item.id);

/**
 * Линия материала, когда автор не выбрал другую.
 *
 * ISKCON, а не «для всех»: так решено осознанно, чтобы не было путаницы.
 * Каталог наполнялся в контексте ISKCON, и материал без явной пометки с
 * подавляющей вероятностью оттуда. «Для всех линий» — отдельный осознанный
 * выбор редактора (`null`), а не значение по умолчанию.
 */
export const DEFAULT_CONTENT_LINEAGE: LineageId = 'iskcon';

/**
 * Настройка сервиса поверх портального профиля.
 *
 * - `null` — как в профиле: линия из настроек при регистрации;
 * - идентификатор — смотреть эту линию в данном сервисе, что бы ни было в
 *   профиле (преданный ISKCON слушает бхаджаны Сарасват Матха);
 * - `'all'` — не фильтровать вовсе.
 */
export type LineagePreference = LineageId | 'all' | null;

export const LINEAGE_ALL = 'all' as const;

export function isLineageId(value: unknown): value is LineageId {
  return (
    typeof value === 'string' && (LINEAGE_IDS as readonly string[]).includes(value)
  );
}

/** Значение из базы → идентификатор: строка вне справочника читается как «нет». */
export function toLineageId(value: unknown): LineageId | null {
  return isLineageId(value) ? value : null;
}

/** Значение настройки из базы → `LineagePreference`; мусор читается как «как в профиле». */
export function toLineagePreference(value: unknown): LineagePreference {
  return isLineagePreference(value) ? value : null;
}

export function isLineagePreference(value: unknown): value is LineagePreference {
  return value === null || value === LINEAGE_ALL || isLineageId(value);
}

export function lineageOption(id: string | null | undefined): LineageOption | null {
  if (!id) return null;
  return LINEAGES.find((item) => item.id === id) ?? null;
}

/** Полное название или `null`, если линии нет либо она не из справочника. */
export function lineageLabel(id: string | null | undefined): string | null {
  return lineageOption(id)?.label ?? null;
}

/** Строки одной группы — для `<optgroup>` и раскладки карточек выбора. */
export function lineagesByGroup(): Array<{
  group: LineageGroup;
  label: string;
  items: LineageOption[];
}> {
  const groups: LineageGroup[] = ['iskcon', 'gaudiya_math', 'parivara'];
  return groups.map((group) => ({
    group,
    label: LINEAGE_GROUP_LABELS[group],
    items: LINEAGES.filter((item) => item.group === group),
  }));
}

/** Тот, чью выдачу собираем. Ровно то, что сервис читает из `User`. */
export interface LineageViewer {
  spiritualStage: SpiritualStage | null;
  lineage: LineageId | null;
}

/**
 * Преданный ли человек в смысле линии: этап «преданный» независимо от
 * подтверждения. Подтверждение наставником — про доступ к закрытым сервисам,
 * а не про то, чью традицию человеку показывать: самоопределившийся преданный
 * Гаудия-матха ждать проверки месяц, глядя на чужие лекции, не должен.
 */
export function isDevotee(viewer: LineageViewer | null | undefined): boolean {
  return viewer?.spiritualStage === 'devotee';
}

/**
 * Какую линию показывать в сервисе. `null` — не фильтровать.
 *
 * Одна функция на все сервисы и на веб: Образование и Музыка обязаны отвечать
 * на вопрос «что я вижу» одинаково, а страница — рисовать ту же подпись, что
 * применил API.
 *
 * Явная настройка сервиса сильнее профиля и работает у любого этапа: она
 * выбрана руками. Без неё фильтр включается только у преданного и только
 * когда линия в профиле указана; у остальных выдача полная.
 */
export function resolveContentLineage(
  viewer: LineageViewer | null | undefined,
  preference: LineagePreference,
): LineageId | null {
  if (preference === LINEAGE_ALL) return null;
  if (preference) return preference;
  if (!isDevotee(viewer)) return null;
  return viewer?.lineage ?? null;
}

/**
 * Нужно ли человеку предложить выбрать линию: преданный, у которого её ещё
 * нет. Возможность появилась позже анкеты, и у старых аккаунтов поле пусто.
 */
export function needsLineageChoice(
  viewer: LineageViewer | null | undefined,
): boolean {
  return isDevotee(viewer) && !viewer?.lineage;
}

/**
 * Линия для нового материала, когда автор её не указал: своя у преданного,
 * иначе значение по умолчанию. Формы предзаполняют то же самое, поэтому
 * человек видит, что уйдёт на сервер, а не узнаёт об этом из карточки.
 */
export function defaultLineageFor(
  author: LineageViewer | null | undefined,
): LineageId {
  return isDevotee(author) && author?.lineage
    ? author.lineage
    : DEFAULT_CONTENT_LINEAGE;
}
