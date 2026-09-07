import type { UnionProfileFieldKey } from "@vedamatch/shared";

/**
 * Значки полей анкеты Знакомств — свои, рисованные штрихом, а не из
 * библиотеки: под полосой заполненности на главной они стоят рядом в ряд,
 * и набор обязан читаться как одна рука. Каждый — пара-тройка линий в
 * сетке 24×24, без заливок: заполненность поля показывает цвет и толщина
 * обводки, а не сама картинка.
 *
 * Ключи — ровно `UnionProfileFieldKey`: добавилось поле в анкету — TypeScript
 * потребует значок здесь.
 */
const PATHS: Record<UnionProfileFieldKey, string> = {
  // рамка с горой и солнцем
  photos: "M4 6.5h16v11H4z M7 15l3.5-4 2.5 3 2-2 3 3 M16 9.5h.01",
  // строки текста, последняя короче
  about: "M5 7h14 M5 12h11 M5 17h7",
  // речевой пузырь
  status: "M5 6h14v9h-7l-4 3v-3H5z",
  // сердце
  intentions: "M12 19s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 1.5c0 5-7 9.5-7 9.5z",
  // земной шар с меридианом
  languages: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M4 12h16 M12 4c-3 3-3 13 0 16 M12 4c3 3 3 13 0 16",
  // искра
  interests: "M12 4v5 M12 15v5 M4 12h5 M15 12h5 M7 7l3 3 M14 14l3 3 M17 7l-3 3 M10 14l-3 3",
  // лотос-чаша
  values: "M12 18c-4 0-7-3-7-6 2 0 4 1 5 3 0-3 1-6 2-8 1 2 2 5 2 8 1-2 3-3 5-3 0 3-3 6-7 6z",
  // ключ
  skills: "M8 14a3.5 3.5 0 1 1 0-.01 M10.5 12.5L19 4 M15 8l2 2 M13 10l2 2",
  // два кольца
  familyStatus: "M9.5 12a3.5 3.5 0 1 1 0-.01 M14.5 12a3.5 3.5 0 1 1 0-.01",
  // человек и малый человек
  childrenStatus: "M9 8a2 2 0 1 1 0-.01 M6 19v-5a3 3 0 0 1 6 0v5 M17 11a1.5 1.5 0 1 1 0-.01 M15 19v-3a2 2 0 0 1 4 0v3",
  // лист с прожилкой
  diet: "M5 19C5 10 10 5 19 5c0 9-5 14-14 14z M5 19l9-9",
  // четыре зарубки
  regulativePrinciples: "M6 5v14 M10 5v14 M14 5v14 M18 5v14 M4 12h16",
  // мерная линейка
  heightCm: "M12 4v16 M8 4h8 M8 20h8 M12 8h3 M12 12h3 M12 16h3",
  // раскрытая книга
  education: "M4 6c3-1 5-1 8 1 3-2 5-2 8-1v12c-3-1-5-1-8 1-3-2-5-2-8-1z M12 7v12",
  // пламя светильника
  spiritualEducation: "M12 20c-3 0-5-2-5-5 0-3 2-4 3-7 1 2 2 3 2 5 1-1 1-2 1-4 2 2 4 4 4 6 0 3-2 5-5 5z",
  // домик
  housing: "M4 12l8-7 8 7 M6 10v9h12v-9 M10 19v-5h4v5",
  // монета
  income: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 7v10 M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5 1-2.5 2s1 1.7 2.5 2 2.5 1 2.5 2-1 2-2.5 2-2.3-.6-2.7-1.5",
};

export function CompletenessIcon({
  field,
  className,
}: {
  field: UnionProfileFieldKey;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[field]} />
    </svg>
  );
}

export const COMPLETENESS_ICON_KEYS = Object.keys(PATHS) as UnionProfileFieldKey[];
