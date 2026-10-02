import Link from "next/link";
import type { ReactNode } from "react";
import type { Gender } from "@vedamatch/shared";

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

/** Кто смотрит ленту — и против кого кнопка «Женщины»/«Мужчины». */
export function oppositeGenderOf(
  gender: Gender | null | undefined,
): 'male' | 'female' | null {
  if (gender === 'male') return 'female';
  if (gender === 'female') return 'male';
  return null;
}

/**
 * Надпись кнопки фильтра по противоположному полу (VED-673): заказчик просил
 * вместо абстрактного «Противоположный пол» прямо «Женщины» мужчине и
 * «Мужчины» женщине. Значок при этом уже соответствует надписи: мужчине —
 * Венера, женщине — Марс.
 */
export function oppositeGenderLabel(
  gender: Gender | null | undefined,
): string {
  if (gender === "male") return "Женщины";
  if (gender === "female") return "Мужчины";
  return "Противоположный пол";
}

/**
 * Отбор по полу, который применит сервер (VED-673). Ровно та же развилка, что
 * в `resolveUnionGenderFilter` на API: явный пол — он, «все» или режим
 * «показать всё» — без отбора, иначе противоположный полу смотрящего.
 *
 * Кнопка панели раньше смотрела только на параметр `gender`, а выдача — ещё и
 * на `showAll`: отсюда «нажата кнопка Женщины, а показывает и мужчин».
 */
export function effectiveGenderFilter(
  params: Record<string, string | string[] | undefined>,
  viewerGender: Gender | null | undefined,
): "male" | "female" | "all" {
  const raw = firstValue(params.gender);
  const showAll = firstValue(params.showAll) === "true";
  if (raw === "male" || raw === "female") return raw;
  if (raw === "all" || showAll) return "all";
  return oppositeGenderOf(viewerGender) ?? "all";
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Ссылка режима ленты: пол задан явно, а молчаливые сужения сняты (VED-673).
 *
 * `showAll` — не «показать отсмотренных», а «показать всех»: он же снимает
 * возрастные пожелания из анкеты, требование полной анкеты и «семейный» пол,
 * и уже отсмотренные снова попадают в ленту. Без него кнопки показывали
 * часть анкет — ровно то, что осталось после этих сужений, — а форма
 * фильтров со своим «показать всех» показывала все.
 */
function genderModeHref(
  path: string,
  params: Record<string, string | string[] | undefined>,
  gender: "all" | "male" | "female" | null,
): string {
  const next = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (
      name === "page" ||
      name === "gender" ||
      name === "showAll" ||
      value === undefined
    ) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      next.append(name, item);
    }
  }
  if (gender) next.set("gender", gender);
  next.set("showAll", "true");
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}

/** «Показать всех»: все анкеты, без молчаливых сужений. */
export function everyoneHref(
  path: string,
  params: Record<string, string | string[] | undefined>,
): string {
  return genderModeHref(path, params, "all");
}

/**
 * «Противоположный пол» (VED-673): весь противоположный пол, без молчаливых
 * сужений. Пол задаётся явно, а не снятием `gender`: режим «показать всё»
 * иначе снимал бы и его, и в ленту попадали бы все подряд. Страница — снова
 * первая.
 */
export function oppositeGenderHref(
  path: string,
  params: Record<string, string | string[] | undefined>,
  viewerGender: Gender | null | undefined = undefined,
): string {
  return genderModeHref(path, params, oppositeGenderOf(viewerGender));
}
