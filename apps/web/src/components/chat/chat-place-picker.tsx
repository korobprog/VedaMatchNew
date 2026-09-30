"use client";

import { useEffect, useState } from "react";
import type { ChatTravelMapPlaceSnapshot } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

/**
 * Необязательная привязка новой группы к месту на карте. Поиск идёт в API
 * Чата (через шину), а не в клиент «Путешествий».
 */
export function ChatPlacePicker({
  value,
  onChange,
}: {
  value: ChatTravelMapPlaceSnapshot | null;
  onChange: (place: ChatTravelMapPlaceSnapshot | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ChatTravelMapPlaceSnapshot[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      apiFetch(
        `${API_URL}/chat/conversations/place-search?q=${encodeURIComponent(q)}`,
        { credentials: "include", signal: controller.signal },
      )
        .then((res) => (res.ok ? res.json() : []))
        .then((rows: ChatTravelMapPlaceSnapshot[]) => setItems(rows))
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setItems([]);
        });
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="chat-place-search" className="text-xs font-medium text-text-1">
        Место на карте <span className="text-text-2">(необязательно)</span>
      </label>
      {value ? (
        <span className="inline-flex w-fit max-w-full items-center gap-2 rounded-xl border border-cyan/34 bg-cyan/10 py-1 pl-3 pr-1 text-sm text-text-0">
          <span aria-hidden>📍</span>
          <span className="truncate">{value.title}</span>
          <button
            type="button"
            aria-label={`Убрать место «${value.title}»`}
            onClick={() => onChange(null)}
            className="flex size-7 items-center justify-center rounded-lg text-text-1 hover:text-text-0"
          >
            <span aria-hidden>×</span>
          </button>
        </span>
      ) : (
        <>
          <input
            id="chat-place-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Начните вводить название места"
            maxLength={80}
            autoComplete="off"
            className="min-h-11 rounded-2xl border border-glass-brd bg-glass px-3.5 text-[15px] text-text-0 outline-none placeholder:text-text-2"
          />
          {items.length > 0 && (
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(item);
                      setQuery("");
                      setItems([]);
                    }}
                    className="w-full rounded-xl border border-transparent p-2.5 text-left text-sm text-text-0 hover:bg-white/5"
                  >
                    {[item.kindLabel, item.title, item.city]
                      .filter(Boolean)
                      .join(" · ")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
