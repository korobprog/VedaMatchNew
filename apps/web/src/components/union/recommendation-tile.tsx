"use client";

import type { UnionRecommendation } from "@vedamatch/shared";

/**
 * Компактная плитка для списка на телефоне: квадратное фото, поверх — имя,
 * возраст и процент. Квадрат, а не портрет: при двух колонках на 375px
 * портретная плитка даёт три с половиной ряда, квадратная — четыре, то есть
 * восемь человек за экран. Дальше сплющивать нельзя — в альбомной обрезке
 * начинают резаться лица, а в знакомствах это главное содержимое.
 */
export function RecommendationTile({
  item,
  onOpen,
}: {
  item: UnionRecommendation;
  onOpen: () => void;
}) {
  const { user, compatibility } = item;
  const cover = user.photos[0]?.url ?? user.avatarUrl;
  const title = user.age != null ? `${user.name}, ${user.age}` : user.name;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${title} — совместимость ${compatibility.total}%`}
      className="group relative block aspect-square w-full overflow-hidden rounded-2xl border border-glass-brd bg-bg-2 text-left"
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- фото из нашего S3
        <img
          src={cover}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition group-hover:scale-[1.03]"
          referrerPolicy="no-referrer"
          draggable={false}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-magenta/25 to-[#B23EFF]/25 font-display text-3xl font-bold text-text-0">
          {user.name.charAt(0).toUpperCase()}
        </span>
      )}

      {/* Затемнение только снизу: имя должно читаться на любом снимке, но
          закрывать им лицо целиком незачем. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 to-transparent"
      />

      <span
        aria-hidden="true"
        className="absolute right-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur"
      >
        {compatibility.total}%
      </span>

      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 truncate p-2 text-sm font-medium text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]"
      >
        {title}
      </span>
    </button>
  );
}
