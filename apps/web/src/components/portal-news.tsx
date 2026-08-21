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

import { useSyncExternalStore } from "react";
import Link from "next/link";
import type { PublicAnnouncementDto } from "@vedamatch/shared";
import { HeadsetIcon } from "@/components/icons/notification-icons";
import {
  readSeenNews,
  rememberSeenNews,
  serverSeenNews,
  subscribeToSeenNews,
} from "@/lib/portal-news-seen";

export function PortalNews({ items }: { items: PublicAnnouncementDto[] }) {
  const hidden = useSyncExternalStore(
    subscribeToSeenNews,
    readSeenNews,
    serverSeenNews,
  );

  const visible = items.filter((item) => !hidden.includes(item.id));
  const pinned = visible.find((item) => item.pinned) ?? null;
  const rest = visible.filter((item) => item.id !== pinned?.id).slice(0, 3);

  return (
    <section aria-label="Сообщения VedaMatch" className="mb-6 space-y-3">
      {pinned && (
        <article className="glass rounded-2xl border border-gold/40 bg-gold/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-wide text-gold">
                Сообщения VedaMatch
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
              onClick={() => rememberSeenNews(pinned.id)}
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
              {pinned ? "Ещё сообщения" : "Сообщения VedaMatch"}
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
                  onClick={() => rememberSeenNews(item.id)}
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
                  onClick={() => rememberSeenNews(item.id)}
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

      <SupportLink />
    </section>
  );
}

/**
 * Обратная связь под новостями.
 *
 * Новость — единственное место на портале, где администрация обращается к
 * человеку, и логично, что ответить он захочет там же. Ведёт в поддержку: там
 * обращение привязывается к аккаунту и получает статус, а не теряется в чате.
 */
function SupportLink() {
  return (
    <Link
      href="/support"
      className="glass flex items-center gap-3 rounded-2xl border border-glass-brd px-4 py-3 transition-colors hover:border-cyan/40"
    >
      <HeadsetIcon className="h-8 w-8 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-0">
          Написать в поддержку
        </span>
        <span className="block text-xs text-text-2">
          Вопрос, идея или что-то сломалось — ответим и покажем статус обращения
        </span>
      </span>
      <span aria-hidden="true" className="ml-auto text-text-2">
        ›
      </span>
    </Link>
  );
}
