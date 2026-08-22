"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { ChatMapState } from "@vedamatch/shared";
import type { ChatMapHandle } from "./chat-map";
import { withPlural } from "./chat-plural";

// Карта грузится только в браузере: Leaflet трогает window при вычислении
// модуля и уронил бы серверный рендер страницы.
const ChatMap = dynamic(() => import("./chat-map").then((m) => m.ChatMap), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] w-full animate-pulse rounded-3xl border border-glass-brd bg-glass" />
  ),
});

/**
 * Карта общин и городов, списки под ней. Списки — не украшение: на телефоне по карте
 * попасть пальцем в метку трудно, а найти строку в списке легко, и оба
 * ведут в одно и то же место.
 */
export function ChatMapView({ initial }: { initial: ChatMapState }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const mapRef = useRef<ChatMapHandle | null>(null);

  const communities = useMemo(
    () =>
      [...initial.communities].sort(
        (a, b) => b.channels + b.groups - (a.channels + a.groups),
      ),
    [initial.communities],
  );

  const cities = useMemo(
    () => [...initial.cities].sort((a, b) => b.people - a.people),
    [initial.cities],
  );

  const onSelect = useCallback((communityId: string) => {
    setSelected(communityId);
  }, []);

  // Метка города ведёт в справочник, отфильтрованный по нему: карта отвечает
  // «здесь есть люди», а кто именно — уже дело справочника и его видимости.
  const onSelectCity = useCallback(
    (city: string) => {
      router.push(`/chat/people?city=${encodeURIComponent(city)}`);
    },
    [router],
  );

  if (communities.length === 0 && cities.length === 0)
    return (
      <p className="rounded-3xl border border-glass-brd bg-glass p-10 text-center text-sm text-text-1">
        На карте пока пусто: у общин не указано место, а участники не включали
        метку своего города. Включить её можно в своей карточке справочника.
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      <ChatMap
        ref={mapRef}
        communities={communities}
        cities={cities}
        onSelect={onSelect}
        onSelectCity={onSelectCity}
      />

      {cities.length > 0 && (
        <p className="text-[13px] text-text-2">
          Города со счётчиком — участники, включившие метку в своей карточке.
          Метка стоит в центре города, а не по адресу человека.
        </p>
      )}

      {communities.length > 0 && (
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-2">
          Общины
        </h2>
      )}
      {/* Заголовок нужен обоим спискам: без него первый читается как ничей,
          и метки общин на карте будто не имеют строки под ней. */}
      <ul className="flex flex-col gap-1">
        {communities.map((point) => {
          const beseds = point.channels + point.groups;
          return (
            <li
              key={point.community.id}
              className={`flex items-center gap-3 rounded-2xl p-2.5 transition-colors ${
                selected === point.community.id
                  ? "border border-cyan/34 bg-cyan/10"
                  : "border border-transparent hover:bg-white/5"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setSelected(point.community.id);
                  mapRef.current?.flyTo(point.lat, point.lon);
                }}
                className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
              >
                <span className="truncate text-[15px] font-semibold text-text-0">
                  {point.community.name}
                </span>
                <span className="truncate text-[13px] text-text-1">
                  {point.city ?? "Место не указано"}
                  {beseds > 0
                    ? ` · ${withPlural(point.channels, "канал", "канала", "каналов")}, ${withPlural(point.groups, "группа", "группы", "групп")}`
                    : " · открытых бесед пока нет"}
                </span>
              </button>

              {beseds > 0 && (
                <Link
                  href={`/chat/discover?communityId=${point.community.id}`}
                  className="shrink-0 rounded-xl border border-glass-brd px-3.5 py-2.5 text-[13px] font-semibold text-text-1 hover:text-text-0"
                >
                  Беседы
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {cities.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-2">
            Люди по городам
          </h2>
          {/* Список не украшение: на телефоне попасть пальцем в метку трудно,
              а строку нажать легко, и ведут они в одно место. */}
          <ul className="flex flex-col gap-1">
            {cities.map((point) => (
              <li
                key={`${point.city}-${point.country ?? ""}`}
                className="flex items-center gap-3 rounded-2xl border border-transparent p-2.5 transition-colors hover:bg-white/5"
              >
                <button
                  type="button"
                  onClick={() => mapRef.current?.flyTo(point.lat, point.lon)}
                  className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                >
                  <span className="truncate text-[15px] font-semibold text-text-0">
                    {point.city}
                  </span>
                  <span className="truncate text-[13px] text-text-1">
                    {point.country ? `${point.country} · ` : ""}
                    {withPlural(point.people, "человек", "человека", "человек")}
                  </span>
                </button>

                <Link
                  href={`/chat/people?city=${encodeURIComponent(point.city)}`}
                  className="shrink-0 rounded-xl border border-glass-brd px-3.5 py-2.5 text-[13px] font-semibold text-text-1 hover:text-text-0"
                >
                  Смотреть
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
