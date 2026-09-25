import type {
  Gender,
  UnionContactMode,
  UnionFormat,
  UnionIntentionDto,
  UnionIntentionType,
  UnionPrivacySettings,
  UnionProfileCompleteness,
  UnionProfileDto,
  UnionProfileUpdateRequest,
  UnionVisibilityLevel,
} from '@vedamatch/shared';
import { UNION_FIELD_LABELS } from './union-dictionaries';
import { INTENTION_TYPES } from './union-labels';

/**
 * Своя анкета Знакомств — чистая часть формы (`union-profile-form.tsx`,
 * `intention-*.tsx`, `union-profile-progress.tsx` сайта). Экран только
 * рисует и зовёт эти функции: вся арифметика целей и очереди сохранения —
 * здесь, под тестами.
 */

/** Совпадает с MIN/MAX_PROFILE_AGE и UNION_* лимитами на сервере (`union-profile.service.ts`). */
export const MIN_PARTNER_AGE = 18;
export const MAX_PARTNER_AGE = 100;
export const MIN_HEIGHT_CM = 120;
export const MAX_HEIGHT_CM = 230;
/** Сервер принимает не больше 30 значений в каждом списке тегов. */
export const MAX_LIST_ITEMS = 30;
/** Предел своего тега — как у поля ввода на сайте. */
export const MAX_CUSTOM_TAG_LENGTH = 100;
/** Правки копятся столько, прежде чем уйти на сервер одним запросом. */
export const SAVE_DEBOUNCE_MS = 600;

export const FORMAT_LABELS: Record<UnionFormat, string> = {
  online: 'Только онлайн',
  offline: 'Только офлайн',
  any: 'Онлайн и офлайн',
};

export const PRIVACY_LABELS: Record<UnionVisibilityLevel, string> = {
  everyone: 'Видно всем',
  after_match: 'После взаимного интереса',
  hidden: 'Скрыто',
};

export const PRIVACY_FIELDS: readonly [keyof UnionPrivacySettings, string][] = [
  ['photo', 'Фото'],
  ['age', 'Возраст'],
  ['city', 'Город'],
  ['contacts', 'Контакты'],
];

export const CONTACT_MODE_LABELS: Record<UnionContactMode, string> = {
  requests: 'Заявки от всех',
  mutual_only: 'Только взаимные лайки',
};

export function contactModeHint(mode: UnionContactMode): string {
  return mode === 'mutual_only'
    ? 'Односторонние заявки вам не приходят: общение открывается, только когда лайк взаимный.'
    : 'Понравившийся человек может написать вам заявку, а вы ответите взаимностью или откажете.';
}

/** Редактируемая часть анкеты; цели хранятся отдельно — весами. */
export type UnionDraft = Omit<
  UnionProfileUpdateRequest,
  'intentions' | 'privacy' | 'isActive' | 'showcaseOptIn' | 'requestsFromVerifiedOnly' | 'contactMode' | 'familySeeksGender'
> & {
  privacy: UnionPrivacySettings;
  isActive: boolean;
  showcaseOptIn: boolean;
  requestsFromVerifiedOnly: boolean;
  contactMode: UnionContactMode;
  familySeeksGender: Gender | null;
};

/**
 * Черновик из сохранённой анкеты. Статус и «о себе» — портальные: они
 * приходят из профиля портала и есть даже у того, кто анкету ещё не заводил.
 */
export function toDraft(profile: UnionProfileDto | null, portal: { statusLine: string | null; about: string | null }): UnionDraft {
  return {
    about: portal.about ?? profile?.about ?? null,
    status: portal.statusLine ?? profile?.status ?? null,
    familyStatus: profile?.familyStatus ?? null,
    format: profile?.format ?? 'any',
    relocationReady: profile?.relocationReady ?? false,
    languages: profile?.languages ?? [],
    skills: profile?.skills ?? [],
    interests: profile?.interests ?? [],
    values: profile?.values ?? [],
    heightCm: profile?.heightCm ?? null,
    diet: profile?.diet ?? null,
    regulativePrinciples: profile?.regulativePrinciples ?? [],
    childrenStatus: profile?.childrenStatus ?? null,
    education: profile?.education ?? null,
    spiritualEducation: profile?.spiritualEducation ?? null,
    housing: profile?.housing ?? null,
    income: profile?.income ?? null,
    pets: profile?.pets ?? [],
    ageRangeMin: profile?.ageRangeMin ?? null,
    ageRangeMax: profile?.ageRangeMax ?? null,
    privacy: profile?.privacy ?? {},
    isActive: profile?.isActive ?? true,
    showcaseOptIn: profile?.showcaseOptIn ?? false,
    requestsFromVerifiedOnly: profile?.requestsFromVerifiedOnly ?? false,
    contactMode: profile?.contactMode ?? 'requests',
    familySeeksGender: profile?.familySeeksGender ?? null,
  };
}

// ---- цели -------------------------------------------------------------

export type IntentionWeights = Record<UnionIntentionType, number>;

const EMPTY_WEIGHTS: IntentionWeights = { family: 0, business: 0, friendship: 0, service: 0 };

/** Ровные веса у новичка: неровный умолчательный открывал бы каждому режим процентов. */
export function toWeights(profile: UnionProfileDto | null): IntentionWeights {
  if (!profile) return { family: 25, business: 25, friendship: 25, service: 25 };
  const weights = { ...EMPTY_WEIGHTS };
  for (const intention of profile.intentions) weights[intention.type] = intention.weight;
  return weights;
}

export function intentionSum(weights: IntentionWeights): number {
  return INTENTION_TYPES.reduce((sum, type) => sum + weights[type], 0);
}

export function selectedTypes(weights: IntentionWeights): UnionIntentionType[] {
  return INTENTION_TYPES.filter((type) => weights[type] > 0);
}

/**
 * Делит 100 поровну, остаток — первым по порядку: три цели дают 34/33/33, а
 * не 33/33/33, сумма обязана быть ровно 100.
 */
export function evenWeights(selected: readonly UnionIntentionType[]): IntentionWeights {
  if (selected.length === 0) return evenWeights(INTENTION_TYPES);
  const base = Math.floor(100 / selected.length);
  let remainder = 100 - base * selected.length;
  const weights = { ...EMPTY_WEIGHTS };
  for (const type of INTENTION_TYPES) {
    if (!selected.includes(type)) continue;
    weights[type] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return weights;
}

/** Ровно то, что дали бы галочки. Всё остальное — ручная настройка, её нельзя молча потерять. */
export function isEvenSplit(weights: IntentionWeights): boolean {
  const selected = selectedTypes(weights);
  if (selected.length === 0) return false;
  const even = evenWeights(selected);
  return INTENTION_TYPES.every((type) => weights[type] === even[type]);
}

/** Пропорционально приводит веса к сумме 100 — кнопка «Выровнять до 100%». */
export function normalizeWeights(weights: IntentionWeights): IntentionWeights {
  const sum = intentionSum(weights);
  if (sum === 0) return { family: 25, business: 25, friendship: 25, service: 25 };
  const normalized = INTENTION_TYPES.map((type) => ({ type, weight: Math.floor((weights[type] / sum) * 100) }));
  let remainder = 100 - normalized.reduce((total, item) => total + item.weight, 0);
  for (const item of normalized) {
    if (remainder === 0) break;
    if (item.weight > 0) {
      item.weight += 1;
      remainder -= 1;
    }
  }
  if (remainder > 0) normalized[0].weight += remainder;
  return Object.fromEntries(normalized.map((item) => [item.type, item.weight])) as IntentionWeights;
}

/** Шаг тонкой настройки: ползунка в приложении нет, кнопки «−5» и «+5». */
export const WEIGHT_STEP = 5;

export function stepWeight(weights: IntentionWeights, type: UnionIntentionType, delta: number): IntentionWeights {
  const value = Math.min(100, Math.max(0, weights[type] + delta));
  return { ...weights, [type]: value };
}

/** Цели в теле запроса: сервер требует их в каждом `PUT` и не принимает нулевые. */
export function intentionsOf(weights: IntentionWeights): UnionIntentionDto[] {
  return INTENTION_TYPES.filter((type) => weights[type] > 0).map((type) => ({ type, weight: weights[type] }));
}

/** Семью можно искать только с 18 лет; неизвестный возраст — тоже нельзя. */
export function canChooseFamily(age: number | null): boolean {
  return age !== null && age >= MIN_PARTNER_AGE;
}

/**
 * Галочка цели в обычном режиме. Последнюю цель снять нельзя — без целей
 * анкета не сохранится; `null` — нажатие отклонено, экран объяснит почему.
 */
export function toggleIntention(
  weights: IntentionWeights,
  type: UnionIntentionType,
  viewerAge: number | null,
): IntentionWeights | null {
  if (type === 'family' && !canChooseFamily(viewerAge)) return weights;
  const selected = selectedTypes(weights);
  const next = selected.includes(type)
    ? selected.filter((item) => item !== type)
    : INTENTION_TYPES.filter((item) => item === type || selected.includes(item));
  return next.length === 0 ? null : evenWeights(next);
}

export function oppositeGender(gender: Gender): Gender {
  return gender === 'male' ? 'female' : 'male';
}

/**
 * Кого искать при цели «Создание семьи» после смены целей. Отметили семью, а
 * пол ещё не выбран и известен из аккаунта — подставляем противоположный;
 * сняли семью — выбор сбрасывается: без цели он ничего не значит.
 * `undefined` — менять нечего.
 */
export function seeksGenderAfter(
  before: IntentionWeights,
  after: IntentionWeights,
  seeks: Gender | null,
  viewerGender: Gender | null,
): Gender | null | undefined {
  if (after.family > 0 && before.family === 0 && seeks === null && viewerGender) return oppositeGender(viewerGender);
  if (after.family === 0 && before.family > 0 && seeks !== null) return null;
  return undefined;
}

// ---- очередь сохранения ------------------------------------------------

/**
 * Накопленный патч: правки разных полей за время задержки уходят одним
 * запросом, и следующая не затирает предыдущую. Цели кладутся каждый раз
 * заново — сервер требует их в любом запросе.
 */
export function mergePatch(
  pending: UnionProfileUpdateRequest | null,
  patch: Partial<UnionProfileUpdateRequest>,
  weights: IntentionWeights,
): UnionProfileUpdateRequest {
  return { ...(pending ?? {}), ...patch, intentions: intentionsOf(weights) };
}

// ---- поля --------------------------------------------------------------

/** Короткое представление списка в строке анкеты: три и «+N». */
export function listValue(items: readonly string[]): string | null {
  if (items.length === 0) return null;
  if (items.length <= 3) return items.join(', ');
  return `${items.slice(0, 3).join(', ')} +${items.length - 3}`;
}

/**
 * Число из поля ввода в пределах; пусто — `null` («не указано»), вне
 * пределов — ошибка словами, а не молчаливая подрезка.
 */
export function parseBoundedNumber(
  raw: string,
  min: number,
  max: number,
): { ok: true; value: number | null } | { ok: false; message: string } {
  const text = raw.trim();
  if (text === '') return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false, message: 'Нужно целое число.' };
  const value = Number(text);
  if (value < min || value > max) return { ok: false, message: `От ${min} до ${max}.` };
  return { ok: true, value };
}

/** Желаемый возраст партнёра: обе границы необязательны, но нижняя не выше верхней. */
export function parseAgeRange(
  minRaw: string,
  maxRaw: string,
): { ok: true; min: number | null; max: number | null } | { ok: false; message: string } {
  const min = parseBoundedNumber(minRaw, MIN_PARTNER_AGE, MAX_PARTNER_AGE);
  if (!min.ok) return { ok: false, message: `Возраст «от»: ${min.message}` };
  const max = parseBoundedNumber(maxRaw, MIN_PARTNER_AGE, MAX_PARTNER_AGE);
  if (!max.ok) return { ok: false, message: `Возраст «до»: ${max.message}` };
  if (min.value !== null && max.value !== null && min.value > max.value) {
    return { ok: false, message: 'Возраст «от» больше, чем «до».' };
  }
  return { ok: true, min: min.value, max: max.value };
}

export function ageRangeValue(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min == null && max == null) return null;
  return `от ${min ?? MIN_PARTNER_AGE} до ${max ?? MAX_PARTNER_AGE} лет`;
}

/** Сравнение тегов без регистра и пробелов по краям — «Йога» и «йога » одно и то же. */
export function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

/** Переключить тег из списка вариантов. Сверх предела сервера не добавляем. */
export function toggleTag(selected: readonly string[], value: string): string[] {
  const key = normalizeTag(value);
  if (selected.some((item) => normalizeTag(item) === key)) {
    return selected.filter((item) => normalizeTag(item) !== key);
  }
  if (selected.length >= MAX_LIST_ITEMS) return [...selected];
  return [...selected, value.trim()];
}

/**
 * Можно ли добавить свой тег: не пусто, не длиннее предела, не повтор уже
 * выбранного и не повтор варианта из списка — его выбирают кнопкой.
 */
export function canAddCustomTag(value: string, selected: readonly string[], options: readonly { value: string }[]): boolean {
  const text = value.trim();
  if (!text || text.length > MAX_CUSTOM_TAG_LENGTH || selected.length >= MAX_LIST_ITEMS) return false;
  const key = normalizeTag(text);
  return !selected.some((item) => normalizeTag(item) === key) && !options.some((option) => normalizeTag(option.value) === key);
}

// ---- прогресс ----------------------------------------------------------

/** Тон полосы заполненности: насколько анкета готова к показу. */
export function progressTone(percent: number): 'cyan' | 'gold' | 'magenta' {
  if (percent >= 70) return 'cyan';
  if (percent >= 40) return 'gold';
  return 'magenta';
}

/**
 * Подсказка под полосой. Процент — плохой стимул, он ничего не обещает;
 * поэтому первым называется последствие, и оно настоящее: лента ставит
 * анкеты с фото выше.
 */
export function progressHint(completeness: UnionProfileCompleteness): string {
  const hasPhotos = completeness.items.find((item) => item.key === 'photos')?.filled ?? false;
  if (!hasPhotos) return 'Анкеты с фото показываются выше — добавьте фото ниже.';
  if (completeness.next) return `Дальше: ${UNION_FIELD_LABELS[completeness.next]}`;
  return 'Анкета заполнена полностью — так вас найдут быстрее.';
}
