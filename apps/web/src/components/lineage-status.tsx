import Link from "next/link";
import { lineageLabel, type LineageId } from "@vedamatch/shared";

/**
 * Строка «что мне сейчас показывают»: линия, по которой отфильтрована
 * выдача, и ссылка на настройку. Без неё преданный, не нашедший знакомую
 * лекцию, решает, что её нет в каталоге, а не что она в другой линии.
 *
 * Серверный компонент: ничего не делает, только показывает. Линия приходит
 * уже вычисленной — той же `resolveContentLineage`, что применил API.
 */
export function LineageStatus({
  lineage,
  settingsHref,
  allHref,
  className = "",
}: {
  /** `null` — фильтра нет; строка тогда не рисуется. */
  lineage: LineageId | null;
  settingsHref: string;
  /** Ссылка «показать всё» на один просмотр, без смены настройки. */
  allHref?: string;
  className?: string;
}) {
  const label = lineageLabel(lineage);
  if (!label) return null;
  return (
    <p className={`text-xs text-text-2 ${className}`}>
      Показываем линию{" "}
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
