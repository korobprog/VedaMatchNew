import Link from "next/link";
import { lineageIdsLabel, type LineageId } from "@vedamatch/shared";

/**
 * Строка «что мне сейчас показывают»: линия, по которой отфильтрована
 * выдача, и ссылка на настройку. Без неё преданный, не нашедший знакомую
 * лекцию, решает, что её нет в каталоге, а не что она в другой линии.
 *
 * Серверный компонент: ничего не делает, только показывает. Линии приходят
 * уже вычисленными — той же `effectiveLineageIds`, что применил API: одна,
 * группа целиком или несколько из «Фильтров материалов» (VED-617).
 */
export function LineageStatus({
  lineageIds,
  settingsHref,
  allHref,
  className = "",
}: {
  /** Линии под фильтром; `null` или пусто — фильтра нет, строки нет. */
  lineageIds: readonly LineageId[] | null;
  settingsHref: string;
  /** Ссылка «показать всё» на один просмотр, без смены настройки. */
  allHref?: string;
  className?: string;
}) {
  // «Гаудия-матх» для группы, «Гаудия-матх — IPBYS» для одной линии,
  // «ISKCON, IPBYS» для нескольких.
  const label = lineageIdsLabel(lineageIds);
  if (!label) return null;
  return (
    <p className={`text-xs text-text-2 ${className}`}>
      {lineageIds && lineageIds.length > 1 ? "Показываем линии" : "Показываем линию"}{" "}
      <span className="font-medium text-text-1">{label}</span>
      {" · "}
      <Link href={settingsHref} className="underline hover:text-text-0">
        настроить
      </Link>
      {allHref && (
        <>
          {" · "}
          <Link href={allHref} className="underline hover:text-text-0">
            показать все линии
          </Link>
        </>
      )}
    </p>
  );
}
