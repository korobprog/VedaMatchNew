import type {
  SpiritualStage,
  UnionCompatibilityCriterion,
  UnionIntentionType,
  UnionSwipeDecision,
  UnionUserSummary,
} from '@vedamatch/shared';

/**
 * Подписи Знакомств — перенос `apps/web/src/components/union/labels.ts` и
 * соседних словарей подписей. Слова те же, что на сайте: человек, открывший
 * анкету в приложении и на сайте, не должен видеть два разных названия одной
 * цели. Правка формулировки — в обоих местах.
 */

export const INTENTION_LABELS: Record<UnionIntentionType, string> = {
  family: 'Создание семьи',
  business: 'Бизнес и проекты',
  friendship: 'Дружба по интересам',
  service: 'Совместное служение',
};

/** Порядок целей — как на сайте: семья первой, ради неё сервис и заведён. */
export const INTENTION_TYPES = Object.keys(INTENTION_LABELS) as UnionIntentionType[];

/** Из чего складывается процент совместимости — подписи для разбора. */
export const CRITERION_LABELS: Record<UnionCompatibilityCriterion, string> = {
  intentions: 'Цели знакомства',
  stage: 'Духовный этап',
  lifestyle: 'Образ жизни',
  interests: 'Интересы',
  values: 'Ценности',
  location: 'Локация',
  format: 'Формат общения',
};

export const STAGE_LABELS: Record<SpiritualStage, string> = {
  seeker: 'Ищущий',
  practitioner: 'Практикующий основы',
  yogi: 'Йог',
  devotee: 'Преданный',
};

/**
 * Пометка «решение по анкете уже принято» (`decision-badge.tsx` на сайте).
 * Пропуск — решение ни о чём, никому ничего не ушло; лайк и суперлайк —
 * отправленный запрос, который лежит у человека на той стороне.
 */
export const DECISION_LABELS: Record<UnionSwipeDecision, { full: string; short: string }> = {
  like: { full: 'Вы отправили запрос', short: 'Запрос отправлен' },
  superlike: { full: 'Вы отправили суперлайк', short: 'Суперлайк' },
  pass: { full: 'Вы пропускали эту анкету', short: 'Пропущена' },
};

/** Склонение «лет / года / год» для подписи возраста. */
export function yearsSuffix(age: number): string {
  const lastTwo = age % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'лет';
  switch (age % 10) {
    case 1:
      return 'год';
    case 2:
    case 3:
    case 4:
      return 'года';
    default:
      return 'лет';
  }
}

/** «Имя, 27» — заголовок плитки и карточки колоды. */
export function nameWithAge(user: Pick<UnionUserSummary, 'name' | 'age'>): string {
  return user.age != null ? `${user.name}, ${user.age}` : user.name;
}

/**
 * Строка под именем в анкете: «27 лет · Алматы · Йог». Пустые части
 * выпадают; если не осталось ничего — прочерк, а не пустая строка, иначе
 * под именем зияет дыра высотой в строку.
 */
export function profileSubtitle(
  user: Pick<UnionUserSummary, 'age' | 'city' | 'spiritualStage'>,
): string {
  return (
    [
      user.age != null ? `${user.age} ${yearsSuffix(user.age)}` : null,
      user.city,
      user.spiritualStage ? STAGE_LABELS[user.spiritualStage] : null,
    ]
      .filter(Boolean)
      .join(' · ') || '—'
  );
}

/**
 * Подпись плитки для скринридера. Плитка мелкая, решение по анкете на ней
 * — только галочка в углу, а скринридеру угол ничего не говорит: в режиме
 * «показать всех» отсмотренные лежат вперемешку с новыми.
 */
export function tileAccessibilityLabel(
  user: Pick<UnionUserSummary, 'name' | 'age'>,
  total: number,
  decision: UnionSwipeDecision | null,
): string {
  const decisionPart = decision ? `, ${DECISION_LABELS[decision].full.toLowerCase()}` : '';
  return `${nameWithAge(user)} — совместимость ${total}%${decisionPart}`;
}

/** Первая буква имени — заглушка, когда фото нет вовсе. */
export function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
