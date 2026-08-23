"use client";

/**
 * Новости от администрации на главной.
 *
 * Новость висит, пока человек не нажмёт «ознакомлен». Раньше её закрывали
 * крестиком, а отметка лежала в localStorage — и новость, закрытую когда-то
 * мимоходом, человек больше не видел, а администрация не знала, дошла ли она
 * вообще. Теперь отметка уходит на сервер: она же и статистика прочтений.
 *
 * Закреплённая новость показывается крупно, но текстом не во всю длину:
 * главная существует ради сервисов, и длинная новость оттеснила бы их вниз
 * надолго. Целиком новость открывается в окне — там же и отметка.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicAnnouncementDto } from "@vedamatch/shared";
import { HeadsetIcon } from "@/components/icons/notification-icons";
import { API_URL, apiFetch } from "@/lib/http-client";
import { isNewsTruncated, newsExcerpt } from "@/lib/portal-news-excerpt";

export function PortalNews({ items }: { items: PublicAnnouncementDto[] }) {
  // Отмеченное в этой сессии: сервер уже знает, но страница серверная и
  // перерисуется только на следующей навигации.
  const [acked, setAcked] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function acknowledge(id: string) {
    setPending(id);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/changelog/announcements/${id}/ack`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      setAcked((current) => [...current, id]);
      setOpenId((current) => (current === id ? null : current));
    } catch {
      // Не отметилось — новость остаётся на месте, человек нажмёт ещё раз.
      setError("Не удалось отметить. Попробуйте ещё раз.");
    } finally {
      setPending(null);
    }
  }

  const visible = items.filter(
    (item) => !item.acknowledged && !acked.includes(item.id),
  );
  const pinned = visible.find((item) => item.pinned) ?? null;
  const rest = visible.filter((item) => item.id !== pinned?.id).slice(0, 3);
  const opened = visible.find((item) => item.id === openId) ?? null;

  return (
    <section aria-label="Сообщения VedaMatch" className="mb-6 space-y-3">
      {pinned && (
        <article className="glass rounded-2xl border border-gold/40 bg-gold/5 p-4">
          <p className="font-mono text-[11px] uppercase tracking-wide text-gold">
            Сообщения VedaMatch
          </p>
          <h2 className="mt-1 font-display text-base font-bold text-text-0">
            {pinned.title}
          </h2>
          <p className="mt-1 whitespace-pre-line text-sm text-text-1">
            {newsExcerpt(pinned.body)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {isNewsTruncated(pinned.body) && (
              <button
                type="button"
                onClick={() => setOpenId(pinned.id)}
                className="rounded-xl border border-glass-brd px-3 py-1.5 text-xs font-medium text-text-1 hover:text-text-0"
              >
                Читать полностью
              </button>
            )}
            <AckCheckbox
              item={pinned}
              pending={pending === pinned.id}
              onAck={() => void acknowledge(pinned.id)}
            />
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
          <ul className="mt-2 space-y-3">
            {rest.map((item) => (
              <li key={item.id} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setOpenId(item.id)}
                  className="block w-full text-left text-sm text-text-1 hover:text-text-0"
                >
                  <span className="font-medium text-text-0">{item.title}</span>
                  <span className="ml-2 text-text-2">
                    {new Date(item.publishedAt).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "long",
                    })}
                  </span>
                </button>
                <AckCheckbox
                  item={item}
                  pending={pending === item.id}
                  onAck={() => void acknowledge(item.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      {opened && (
        <NewsDialog
          item={opened}
          pending={pending === opened.id}
          onAck={() => void acknowledge(opened.id)}
          onClose={() => setOpenId(null)}
        />
      )}

      <SupportLink />
    </section>
  );
}

/**
 * Отметка «ознакомлен».
 *
 * Именно чекбокс, а не крестик: крестик означал «убрать с глаз», и человек
 * нажимал его не читая. Галочка — утверждение, и статистика по ней осмысленна.
 * Обратно не снимается: отменённое «ознакомлен» ничего не значит ни для
 * человека, ни для счётчика.
 */
function AckCheckbox({
  item,
  pending,
  onAck,
}: {
  item: PublicAnnouncementDto;
  pending: boolean;
  onAck: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-text-1">
      <input
        type="checkbox"
        checked={false}
        disabled={pending}
        onChange={onAck}
        aria-label={`Ознакомлен: ${item.title}`}
        className="h-4 w-4 accent-[color:var(--vm-gold)]"
      />
      {pending ? "Отмечаем…" : "Ознакомлен"}
    </label>
  );
}

/** Полный текст новости в окне: на карточке он занял бы всю главную. */
function NewsDialog({
  item,
  pending,
  onAck,
  onClose,
}: {
  item: PublicAnnouncementDto;
  pending: boolean;
  onAck: () => void;
  onClose: () => void;
}) {
  // Escape вешаем на документ, а не на контейнер: у div нет фокуса, и
  // onKeyDown на нём не сработал бы, пока человек не кликнет внутрь.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
    >
      <div className="glass max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl border border-glass-brd bg-bg-1 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-text-2">
              {new Date(item.publishedAt).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <h2 className="mt-1 font-display text-lg font-bold text-text-0">
              {item.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть новость"
            className="shrink-0 rounded-lg px-2 py-1 text-text-2 hover:bg-glass hover:text-text-0"
          >
            ✕
          </button>
        </div>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-text-1">
          {item.body}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <AckCheckbox item={item} pending={pending} onAck={onAck} />
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-xl px-3 py-1.5 text-xs font-medium text-text-2 hover:text-text-0"
          >
            Позже
          </button>
        </div>
      </div>
    </div>
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
