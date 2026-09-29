import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Переключатель на панели ленты Знакомств (VED-652) — ссылкой: состояние
 * живёт в адресе, как и все фильтры ленты. Вид — как у кнопок «Свайпами» и
 * «Плотнее» в том же ряду.
 */
export function UnionToggleLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      role="button"
      className={`flex h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border px-1.5 transition active:translate-y-px ${
        active
          ? "border-magenta/40 bg-magenta/10 text-text-0"
          : "glass border-glass-brd text-text-2 hover:text-text-0"
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </Link>
  );
}

/** Адрес с переключённым параметром; страница — снова первая. */
export function toggledHref(
  path: string,
  params: Record<string, string | string[] | undefined>,
  key: string,
  onValue: string,
): string {
  const next = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (name === "page" || name === key || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      next.append(name, item);
    }
  }
  const current = params[key];
  const on = (Array.isArray(current) ? current[0] : current) === onValue;
  if (!on) next.set(key, onValue);
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}
