import type { PortalSearchResponse } from "@vedamatch/shared";

/**
 * «Найдено: N» в выдаче поиска по порталу (VED-316).
 *
 * Сервисы отдают не больше пяти карточек и точного числа совпадений не
 * считают, поэтому число — это показанное, а «+» значит, что в разделе
 * нашлось больше (`more` из ответа API).
 */
export function formatFoundCount(count: number, more = false): string {
  return `${count}${more ? "+" : ""}`;
}

/**
 * Общее число по выдаче. Ответ старого API без `total` считается по группам,
 * чтобы надпись не показала ноль при непустой выдаче.
 */
export function portalSearchTotal(result: PortalSearchResponse): {
  count: number;
  more: boolean;
} {
  const count =
    result.total ??
    result.groups.reduce((sum, group) => sum + group.items.length, 0);
  const more = result.more ?? result.groups.some((group) => group.more);
  return { count, more };
}

/**
 * Надпись над выдачей. `role="status"` — вежливая живая область: новый
 * поиск на той же странице скринридер объявляет, не перебивая.
 */
export function PortalSearchTotal({
  result,
  className,
}: {
  result: PortalSearchResponse;
  className?: string;
}) {
  const { count, more } = portalSearchTotal(result);
  return (
    <p
      role="status"
      aria-live="polite"
      className={`text-sm text-text-1 ${className ?? ""}`}
    >
      Найдено:{" "}
      <span className="font-mono font-semibold text-text-0">
        {formatFoundCount(count, more)}
      </span>
      {more ? (
        <span className="text-text-2">
          {" "}
          — в каждом разделе показаны первые пять
        </span>
      ) : null}
    </p>
  );
}

/** Число у заголовка раздела — туда, где его ищут глазами. */
export function PortalSearchGroupCount({
  count,
  more,
}: {
  count: number;
  more?: boolean;
}) {
  return (
    <span className="shrink-0 text-sm text-text-2">
      Найдено:{" "}
      <span className="font-mono font-semibold text-text-1">
        {formatFoundCount(count, more)}
      </span>
    </span>
  );
}
