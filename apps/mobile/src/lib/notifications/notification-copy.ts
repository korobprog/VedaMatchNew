/**
 * Слова ленты уведомлений в приложении (VED-330).
 *
 * Формулировки собирает клиент, а не издатель события, — то же правило, что
 * на сайте (`apps/web/src/lib/notification-mark.ts`). Сервер присылает код
 * категории и код состояния, а как это называется по-русски, решается здесь.
 *
 * Модуль чистый и без цветов в виде `#RRGGBB`: наружу уходит ИМЯ токена из
 * `theme/tokens.ts`, цвет по нему берёт компонент. Иначе цвет пережил бы
 * переключение темы и остался бы от чужой.
 */

import type { NotificationCategory, NotificationMark } from '@vedamatch/shared';
import type { Palette } from '@/theme/tokens';

/**
 * Название раздела, из которого пришло уведомление.
 *
 * Слова — те же, что человек видит в приложении и на сайте: «Медиатека», а
 * не «Музыка» (название сервиса правит администратор, сверено на проде —
 * см. `config/services.ts`), «Общение» для чата, «Люди» для справочника.
 */
const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  announcements: 'От администрации',
  notices: 'Объявления',
  chat: 'Общение',
  connections: 'Союз',
  support: 'Поддержка',
  transits: 'Астрология',
  market: 'Рынок',
  motivation: 'Мотивация',
  music: 'Медиатека',
  work: 'Работа',
  travel: 'Путешествия',
};

/**
 * Подпись категории. Незнакомый код (запись от сборки с другим набором
 * категорий) не прячем и не падаем на нём — карточка остаётся читаемой и
 * без подписи.
 */
export function categoryLabel(category: string): string | null {
  return CATEGORY_LABELS[category as NotificationCategory] ?? null;
}

/** Вид значка состояния: слово и имя токена для рамки. */
export interface MarkView {
  label: string;
  /**
   * Рамка значка. Цветом смысл не передаётся — его несёт слово: в
   * чёрно-белом виде и дальтонику «Выполнено» остаётся «Выполнено».
   * Подложка не красится и текст тоже: `magenta` 11px на стекле светлой
   * темы даёт 4.46:1, ниже порога, — поэтому слово идёт цветом `text0`,
   * а краска остаётся только на обводке (порог нетекстовой графики 3:1,
   * пары закреплены в `theme/contrast.spec.ts`).
   */
  border: keyof Palette;
}

/**
 * Слова — ровно названия колонок доски «Работа», как их видит человек,
 * который её завёл. «Тестерование» через «е» не опечатка: так называется
 * колонка, и переименовывать её от себя значило бы показывать не то слово,
 * на которое человек нажимал (см. `apps/web/src/lib/notification-mark.ts`).
 */
const MARK_VIEWS: Record<NotificationMark, MarkView> = {
  in_progress: { label: 'В работе', border: 'blue' },
  testing: { label: 'Тестерование', border: 'violet' },
  done: { label: 'Выполнено', border: 'cyan' },
  rework: { label: 'На доработку', border: 'magenta' },
};

/** Вид значка по коду. `null` — значка нет: у уведомления не из «Работы»
 *  состояния не бывает, а незнакомый код рисовать нечем. */
export function markView(mark: NotificationMark | null | undefined): MarkView | null {
  if (!mark) return null;
  return MARK_VIEWS[mark] ?? null;
}

/** Что читает скринридер: «Выполнено» в одиночку не говорит, чьё оно. */
export function markAccessibilityLabel(view: MarkView): string {
  return `Статус: ${view.label}`;
}

/**
 * Подпись карточки для скринридера целиком.
 *
 * Собирается одной строкой, потому что `VoiceOver`/`TalkBack` читают
 * вложенные `Text` по одному и «Рынок», «12 мин назад», «Выполнено»
 * приходят к человеку как три отдельных обрывка без связи с заголовком.
 * Признак «не прочитано» тоже проговаривается словом: цвет и точку
 * скринридер не видит.
 */
export function cardAccessibilityLabel(params: {
  title: string;
  body: string;
  when: string;
  category: string;
  unread: boolean;
  mark: NotificationMark | null | undefined;
}): string {
  const parts: string[] = [];
  if (params.unread) parts.push('Не прочитано');
  const section = categoryLabel(params.category);
  if (section) parts.push(section);
  parts.push(params.title);
  if (params.body) parts.push(params.body);
  const view = markView(params.mark);
  if (view) parts.push(markAccessibilityLabel(view));
  if (params.when) parts.push(params.when);
  return parts.join('. ');
}

/** Подсказка о том, что случится по нажатию: свой экран или браузер. */
export function cardAccessibilityHint(opensSite: boolean): string {
  return opensSite
    ? 'Этого раздела нет в приложении — откроется сайт в браузере'
    : 'Откроет то, о чём уведомление';
}
