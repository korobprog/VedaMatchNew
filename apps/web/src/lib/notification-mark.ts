import type { NotificationMark } from "@vedamatch/shared";

/**
 * Как выглядит значок состояния в ленте уведомлений (VED-272).
 *
 * Зачем он: доска «Работа» возвращает карточку в ленту на каждой смене
 * статуса, и одинаковые с виду уведомления приходится открывать заново, только
 * чтобы понять, что изменилось. API присылает код состояния, слова и цвета —
 * здесь: формулировки собирает клиент, а не издатель события.
 *
 * Разбор по цветам — не единственная примета. Цвет отличает значки друг от
 * друга беглым взглядом, но читается значок по подписи, а узнаётся по знаку:
 * дальтонику и в чёрно-белой печати «Выполнено» остаётся «Выполнено». Поэтому
 * у каждого состояния три приметы сразу — слово, знак и цвет, — и ни одна не
 * несёт смысл в одиночку.
 *
 * Цвета — только токены темы, и каждый определён в обеих: `--vm-violet`,
 * `--vm-blue`, `--vm-cyan`, `--vm-magenta`. Золота в наборе нет намеренно —
 * на светлой теме оно даёт 3,78:1 и мелкой подписи не годится; остальные
 * четыре на стекле карточки дают от 4,68:1 (cyan, светлая тема) до 12,3:1.
 * Подложка у значка не заливается цветом по той же причине: заливка в 12%
 * роняет тот же cyan до 3,99:1.
 */

export interface NotificationMarkView {
  /** Слово на значке — оно же то, что читает скринридер. */
  label: string;
  /**
   * Классы цвета: рамка и текст одним тоном. Фон берётся от карточки, своей
   * заливки у значка нет — см. про контраст выше.
   */
  className: string;
  /** Имя знака из lucide-react; сам знак подставляет компонент. */
  icon: "play" | "flask" | "check" | "undo";
}

const MARK_VIEWS: Record<NotificationMark, NotificationMarkView> = {
  in_progress: {
    label: "В работе",
    className: "border-blue/60 text-blue",
    icon: "play",
  },
  testing: {
    label: "Тестирование",
    className: "border-violet/60 text-violet",
    icon: "flask",
  },
  done: {
    label: "Выполнено",
    className: "border-cyan/60 text-cyan",
    icon: "check",
  },
  rework: {
    label: "На доработку",
    className: "border-magenta/60 text-magenta",
    icon: "undo",
  },
};

/**
 * Вид значка по коду. `null` — значка нет: у уведомления не из «Работы»
 * состояния не бывает, а запись, сделанная сборкой с другим набором, могла
 * принести незнакомый код.
 */
export function notificationMarkView(
  mark: NotificationMark | null | undefined,
): NotificationMarkView | null {
  if (!mark) return null;
  return MARK_VIEWS[mark] ?? null;
}

/** Подпись для скринридера целиком: «Статус: Выполнено». */
export function notificationMarkLabel(view: NotificationMarkView): string {
  return `Статус: ${view.label}`;
}
