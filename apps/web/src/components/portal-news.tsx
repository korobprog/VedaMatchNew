"use client";

/**
 * Новости от администрации на главной.
 *
 * Закреплённая новость показывается целиком: её закрепляют, когда она важнее
 * прочего. Остальные — свёрнутым списком заголовков со ссылкой на полную
 * страницу: главная существует ради сервисов, и лента новостей не должна
 * оттеснять их вниз.
 *
 * Прочитанное запоминается в браузере, а не на сервере: это не переписка и не
 * заявка, отметка нужна одному человеку на одном устройстве, и ради неё не
 * стоит заводить таблицу.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicAnnouncementDto } from "@vedamatch/shared";

const STORAGE_KEY = "vm:portal-news:seen";

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    // Приватный режим запрещает хранилище — покажем новость ещё раз, не беда.
    return [];
  }
}

function remember(id: string) {
  try {
    // Храним последние двадцать: старые новости всё равно уходят с главной.
    const next = [id, ...readSeen().filter((seen) => seen !== id)].slice(0, 20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Не смогли запомнить — покажем снова. Молча.
  }
}

export function PortalNews({ items }: { items: PublicAnnouncementDto[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setHidden(readSeen());
    setReady(true);
  }, []);

  // До чтения хранилища ничего не рисуем: иначе закрытая новость мигнёт на
  // экране и исчезнет — выглядит как сбой.
  if (!ready) return null;

  const visible = items.filter((item) => !hidden.includes(item.id));
  if (visible.length === 0) return null;

  const pinned = visible.find((item) => item.pinned) ?? null;
  const rest = visible.filter((item) => item.id !== pinned?.id).slice(0, 3);

  function hide(id: string) {
    remember(id);
    setHidden((current) => [...current, id]);
  }

  return (
    <section aria-label="Новости VedaMatch" className="mb-6 space-y-3">
      {pinned && (
        <article className="glass rounded-2xl border border-gold/40 bg-gold/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-wide text-gold">
                Новости VedaMatch
              </p>
              <h2 className="mt-1 font-display text-base font-bold text-text-0">
                {pinned.title}
              </h2>
              <p className="mt-1 whitespace-pre-line text-sm text-text-1">
                {pinned.body}
              </p>
            </div>
            <button
              type="button"
              onClick={() => hide(pinned.id)}
              aria-label="Скрыть новость"
              className="shrink-0 rounded-lg px-2 py-1 text-text-2 hover:bg-glass hover:text-text-0"
            >
              ✕
            </button>
          </div>
        </article>
      )}

      {rest.length > 0 && (
        <div className="glass rounded-2xl border border-glass-brd p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-wide text-text-2">
              {pinned ? "Ещё новости" : "Новости VedaMatch"}
            </p>
            <Link
              href="/updates/news"
              className="text-xs font-medium text-cyan hover:underline"
            >
              Все новости
            </Link>
          </div>
          <ul className="mt-2 space-y-2">
            {rest.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3">
                <Link
                  href="/updates/news"
                  onClick={() => remember(item.id)}
                  className="min-w-0 text-sm text-text-1 hover:text-text-0"
                >
                  <span className="font-medium text-text-0">{item.title}</span>
                  <span className="ml-2 text-text-2">
                    {new Date(item.publishedAt).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "long",
                    })}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => hide(item.id)}
                  aria-label={`Скрыть: ${item.title}`}
                  className="shrink-0 rounded-lg px-2 text-text-2 hover:bg-glass hover:text-text-0"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
