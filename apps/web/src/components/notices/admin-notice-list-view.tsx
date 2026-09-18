"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search, Trash2 } from "lucide-react";
import type { AdminNoticeListItemDto, NoticeStatus } from "@vedamatch/shared";
import { NoticesApiError, deleteNotice, getAdminNotices } from "@/lib/notices-api";
import { NOTICE_KIND_LABELS, NOTICE_STATUS_LABELS } from "./notice-labels";

const PAGE_SIZE = 20;

// Тот же текст, что у кнопки «Удалить объявление» на самой странице
// объявления (notice-detail-view.tsx) — обе ведут к одному и тому же
// запросу, предупреждение не должно расходиться по формулировке.
const DELETE_CONFIRM =
  "Удалить объявление насовсем? Вместе с ним пропадут отклики и фотографии.";

const STATUS_OPTIONS: Array<{ value: NoticeStatus | ""; label: string }> = [
  { value: "", label: "Все статусы" },
  ...(
    Object.entries(NOTICE_STATUS_LABELS) as Array<[NoticeStatus, string]>
  ).map(([value, label]) => ({ value, label })),
];

function formatAdminDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Список всех объявлений в админке (VED-42, круг 2). Раньше в разделе
 * «Объявления» были только жалобы и ссылка на журнал — тестировщик прямо
 * написал: «в админке в сервисе Объявления тоже нет [возможности удалять]».
 * Поиск и страницы живут в состоянии компонента, а не в URL: остальная
 * админка Объявлений (жалобы выше на той же странице) устроена так же —
 * клиентский компонент без серверных параметров адреса.
 */
export function AdminNoticeListView() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<NoticeStatus | "">("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminNoticeListItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Полсекунды тишины перед запросом: иначе на каждую букву поиска уходит
    // поход в базу — тот же приём, что у поиска знакомых в work/invite-panel.
    // `setLoading(true)` — внутри таймера, а не в теле эффекта: синхронный
    // вызов setState прямо в эффекте плодит лишний рендер на каждую смену
    // зависимостей (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      setLoading(true);
      getAdminNotices({ q, status: status || undefined, page, pageSize: PAGE_SIZE })
        .then((response) => {
          if (!alive) return;
          setItems(response.items);
          setTotal(response.total);
          setTotalPages(response.totalPages);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (alive)
            setError(
              cause instanceof NoticesApiError
                ? cause.message
                : "Не удалось загрузить список",
            );
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, status, page]);

  async function remove(item: AdminNoticeListItemDto) {
    if (!window.confirm(DELETE_CONFIRM)) return;
    setBusyId(item.id);
    setError(null);
    try {
      await deleteNotice(item.id);
      // Строку убираем сразу, не дожидаясь перезагрузки списка: то же
      // «применилось — значит видно», что и у решения по жалобе рядом.
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (cause) {
      setError(
        cause instanceof NoticesApiError ? cause.message : "Не получилось удалить",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h2 className="mb-1 font-display text-lg font-semibold text-text-0">
        Все объявления
      </h2>
      <p className="mb-4 text-sm text-text-2">
        Поиск по заголовку и имени автора, любой статус, в том числе
        черновики. Удаление здесь — тот же запрос, что и на странице самого
        объявления, и попадает в тот же журнал.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative flex-1 sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-2"
          />
          <input
            type="search"
            value={q}
            // Смена поиска возвращает на первую страницу: иначе фильтр мог бы
            // указывать на несуществующую страницу второго-третьего экрана.
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            maxLength={200}
            aria-label="Поиск объявлений по заголовку или автору"
            placeholder="Заголовок или автор"
            className="w-full rounded-xl border border-glass-brd bg-bg-1 py-2 pl-9 pr-3 text-sm text-text-0"
          />
        </label>
        <label className="text-sm text-text-1">
          <span className="sr-only">Статус</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as NoticeStatus | "");
              setPage(1);
            }}
            className="rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-text-1">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Загружаем…
        </p>
      ) : items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          {q || status
            ? "По таким фильтрам объявлений не нашлось. Попробуйте изменить поиск или статус."
            : "Объявлений пока нет."}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="glass flex flex-wrap items-center gap-3 rounded-2xl border border-glass-brd p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    href={`/notices/${item.id}`}
                    className="font-medium text-text-0 underline underline-offset-2"
                  >
                    {item.title}
                  </Link>
                  <span className="rounded-full border border-glass-brd px-2 py-0.5 text-xs text-text-1">
                    {NOTICE_STATUS_LABELS[item.status]}
                  </span>
                  <span className="text-xs text-text-2">
                    {NOTICE_KIND_LABELS[item.kind]}
                  </span>
                </div>
                {/* Мирское имя: тот же выбор, что у жалоб и журнала выше на
                    этой же странице. */}
                <p className="mt-0.5 text-xs text-text-2">
                  автор {item.authorName}
                  {item.city ? ` · ${item.city}` : ""} · создано{" "}
                  {formatAdminDate(item.createdAt)} · истекает{" "}
                  {formatAdminDate(item.expiresAt)}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => void remove(item)}
                aria-label={`Удалить объявление «${item.title}»`}
                className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-red-400/30 px-3 py-2 text-sm text-red-400 disabled:opacity-50"
              >
                <Trash2 aria-hidden className="size-3.5" />
                {busyId === item.id ? "Удаляем…" : "Удалить"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-text-2">
          <span>
            Всего: {total}. Страница {page} из {totalPages}.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="rounded-xl border border-glass-brd px-3 py-1.5 text-text-1 disabled:opacity-40"
            >
              Назад
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              className="rounded-xl border border-glass-brd px-3 py-1.5 text-text-1 disabled:opacity-40"
            >
              Вперёд
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
