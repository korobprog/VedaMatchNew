"use client";

/**
 * Список уведомлений.
 *
 * Прочитанным помечается только то, что человек открыл. Раньше страница гасила
 * весь список одним запросом при загрузке: открыл одно уведомление, вернулся —
 * а остальных нет, хотя до них ещё не дошли руки. Прочитанное не исчезает
 * сразу, а лежит ниже, приглушённое, неделю; погасить всё разом можно кнопкой.
 *
 * Лента приходит порциями (VED-267). Раньше сервер отдавал её целиком, и две
 * сотни карточек рисовались разом — каждая со стеклом, то есть с собственным
 * `backdrop-filter`: на телефоне это и есть тот самый «очень сильно тормозит».
 * Теперь на экране двадцать, остальное — по кнопке «Показать ещё».
 *
 * Поиск серверный: он ищет по всей ленте, а не среди подгруженного. Отбор на
 * клиенте отвечал бы «ничего не нашлось» на то, до чего человек не долистал, —
 * это было бы хуже, чем отсутствие поиска.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellOff, Search, X } from "lucide-react";
import type {
  NotificationItemDto,
  NotificationCategory,
} from "@vedamatch/shared";
import { fetchInbox, markInboxRead } from "@/lib/notifications-api";
import {
  countUnreadItems,
  INBOX_PAGE_SIZE,
  markAllItemsRead,
  markItemRead,
  mergeInboxPages,
  splitInbox,
} from "@/lib/notifications-inbox";
import { setUnreadCount } from "@/lib/notifications-unread";
import { NotificationIcon } from "@/components/icons/notification-icons";
import { NotificationMarkBadge } from "./notification-mark-badge";

/**
 * Пауза перед запросом при наборе. Меньше — сервер получает запрос на каждую
 * букву; больше — поиск начинает казаться сломанным.
 */
const SEARCH_DEBOUNCE_MS = 300;

/** Потолок перезагрузки после «отметить все прочитанными» — тот же, что у
 *  сервера: просить больше бессмысленно, он всё равно обрежет. */
const MAX_RELOAD = 100;

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} ч назад`;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function NotificationList() {
  const [items, setItems] = useState<NotificationItemDto[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  /** Всё непрочитанное человека: его считает сервер, а не длина порции. */
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  /** Что набрано в поле; в запрос уходит `applied` — после паузы. */
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [searching, setSearching] = useState(false);
  /** Ответ на устаревший запрос не должен перебить свежий: гонку при быстром
   *  наборе гасит счётчик, а не отмена fetch. */
  const requestId = useRef(0);

  useEffect(() => {
    if (query === applied) return;
    const timer = setTimeout(() => setApplied(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, applied]);

  /**
   * Первая порция: при входе на страницу и на каждый новый запрос поиска.
   * Список при этом не гасится в «Загружаем…» — иначе он мигал бы на каждой
   * букве; вместо этого рядом с полем появляется «Ищем…». Поднимает этот
   * признак обработчик набора, а гасит здешний `finally`: из тела эффекта
   * состояние менять напрямую нельзя, это лишний каскад отрисовок.
   */
  const load = useCallback((search: string, limit = INBOX_PAGE_SIZE) => {
    const id = ++requestId.current;
    // Размер порции называем всегда: молчание означало бы «отдай всю ленту»
    // — так API отвечает старым сборкам приложения, которые не умеют просить
    // продолжение.
    void fetchInbox({ query: search, limit })
      .then((page) => {
        if (id !== requestId.current) return;
        setItems(page.items);
        setNextCursor(page.nextCursor ?? null);
        setUnreadTotal(page.unreadCount);
        setUnreadCount(page.unreadCount);
        setFailed(false);
        setMoreFailed(false);
      })
      .catch(() => {
        if (id === requestId.current) setFailed(true);
      })
      .finally(() => {
        if (id === requestId.current) setSearching(false);
      });
  }, []);

  useEffect(() => {
    load(applied);
  }, [applied, load]);

  function loadMore() {
    if (!nextCursor || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    setMoreFailed(false);
    void fetchInbox({ query: applied, cursor: nextCursor })
      .then((page) => {
        if (id !== requestId.current) return;
        setItems((current) => mergeInboxPages(current ?? [], page.items));
        setNextCursor(page.nextCursor ?? null);
        setUnreadTotal(page.unreadCount);
      })
      .catch(() => {
        if (id === requestId.current) setMoreFailed(true);
      })
      .finally(() => {
        if (id === requestId.current) setLoadingMore(false);
      });
  }

  /**
   * Помечаем прочитанным сразу в состоянии и не ждём сервер: переход по ссылке
   * уводит со страницы, и ответ пришёл бы уже некуда.
   */
  function markOne(id: string) {
    setItems((current) => (current ? markItemRead(current, id) : null));
    setUnreadTotal((total) => Math.max(0, total - 1));
    setUnreadCount(Math.max(0, unreadTotal - 1));
    void markInboxRead([id]).catch(() => undefined);
  }

  /**
   * Гасит всё непрочитанное — в том числе то, до чего человек не долистал.
   * Поэтому следом лента перечитывается с начала: строки переехали из первого
   * потока во второй, и прежний курсор указывает уже не туда. Просим столько
   * же карточек, сколько было показано, — место, до которого долистали, не
   * теряется.
   */
  function markAll() {
    const loaded = Math.min(Math.max(items?.length ?? 0, 1), MAX_RELOAD);
    setItems((current) => (current ? markAllItemsRead(current) : null));
    setUnreadTotal(0);
    setUnreadCount(0);
    void markInboxRead()
      .then(() => load(applied, loaded))
      .catch(() => undefined);
  }

  /** Набор в поле: запрос уйдёт после паузы, а «Ищем…» видно сразу. */
  function changeQuery(next: string) {
    setQuery(next);
    if (next.trim() !== applied.trim()) setSearching(true);
  }

  const searchBox = (
    <SearchBox
      value={query}
      onChange={changeQuery}
      onClear={() => changeQuery("")}
      busy={searching}
    />
  );

  if (failed)
    return (
      <p className="text-sm text-magenta">
        Не удалось загрузить уведомления. Попробуйте обновить страницу.
      </p>
    );

  if (items === null) return <p className="text-sm text-text-2">Загружаем…</p>;

  const searchActive = applied.trim().length > 0;

  if (items.length === 0)
    return (
      <div className="space-y-6">
        {searchBox}
        <div className="glass flex flex-col items-center gap-3 rounded-2xl border border-glass-brd px-6 py-12 text-center">
          <BellOff className="h-8 w-8 text-text-2" aria-hidden="true" />
          {searchActive ? (
            <>
              <p className="font-medium text-text-0">Ничего не нашлось</p>
              <p className="max-w-sm text-sm text-text-1">
                По запросу «{applied}» в ваших уведомлениях пусто. Ищем по
                заголовку и тексту — попробуйте другое слово.
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-full border border-glass-brd px-3 py-1 text-xs font-medium text-text-1 hover:text-text-0"
              >
                Показать все уведомления
              </button>
            </>
          ) : (
            <>
              <p className="font-medium text-text-0">Уведомлений нет</p>
              <p className="max-w-sm text-sm text-text-1">
                Здесь появляются новые сообщения, заявки и ответы поддержки.
                Прочитанные остаются на неделю — успеете вернуться.
              </p>
              <NewsLink />
            </>
          )}
        </div>
      </div>
    );

  const { unread, read } = splitInbox(items);

  return (
    <div className="space-y-6">
      {searchBox}

      {unread.length > 0 && (
        <section aria-label="Непрочитанные">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-text-0">
              {/* Непрочитанного столько же, сколько на колокольчике: число
                  приходит от сервера, а не считается по загруженным
                  карточкам. В выдаче поиска считать нечего — там показано
                  ровно то, что нашлось. */}
              Новое · {searchActive ? countUnreadItems(items) : unreadTotal}
            </h2>
            {!searchActive && (
              <button
                type="button"
                onClick={markAll}
                className="rounded-full border border-glass-brd px-3 py-1 text-xs font-medium text-text-1 hover:text-text-0"
              >
                Отметить все прочитанными
              </button>
            )}
          </div>
          <ul className="space-y-3">
            {unread.map((item) => (
              <li key={item.id}>
                <NotificationCard item={item} onOpen={() => markOne(item.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!searchActive && <NewsLink />}

      {read.length > 0 && (
        <section aria-label="Прочитанные">
          <h2 className="mb-3 text-sm font-semibold text-text-2">
            {searchActive ? "Найдено в прочитанном" : "Прочитанное"}
          </h2>
          <ul className="space-y-3">
            {read.map((item) => (
              <li key={item.id}>
                <NotificationCard item={item} muted />
              </li>
            ))}
          </ul>
        </section>
      )}

      {nextCursor && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="glass rounded-full border border-glass-brd px-5 py-2 text-sm font-medium text-text-0 transition-colors hover:border-magenta/40 disabled:text-text-1"
          >
            {loadingMore ? "Загружаем…" : "Показать ещё"}
          </button>
          {moreFailed && (
            <p className="text-xs text-magenta">
              Не удалось загрузить продолжение. Попробуйте ещё раз.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Строка поиска над лентой — ровно там, где её ждёт заказчик (скриншот к
 * VED-267): под заголовком страницы, над списком.
 *
 * Обводка фокуса своя не рисуется: её даёт глобальный `*:focus-visible` из
 * `globals.css`, и она видна на самом поле. Рамка обёртки при этом меняет цвет
 * на `--vm-magenta` — это подсказка, а не замена обводке. Своё кольцо тут
 * стояло и давало два ободка один в другом.
 *
 * Крестик очистки — свой, а родной у `type="search"` спрятан: в WebKit они
 * рисовались рядом, два крестика подряд.
 */
function SearchBox({
  value,
  onChange,
  onClear,
  busy,
}: {
  value: string;
  onChange: (next: string) => void;
  onClear: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="glass flex h-11 flex-1 items-center gap-2.5 rounded-2xl border border-glass-brd px-3.5 transition-colors focus-within:border-magenta">
        <Search className="h-4 w-4 shrink-0 text-text-1" aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Поиск по уведомлениям"
          aria-label="Поиск по уведомлениям"
          className="w-full bg-transparent text-sm text-text-0 placeholder:text-text-1 [&::-webkit-search-cancel-button]:hidden"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Очистить поиск"
            className="shrink-0 rounded-full p-1 text-text-1 hover:text-text-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </label>
      {/* Состояние поиска словами: скринридер узнаёт, что запрос ушёл, а
          зрячий человек — что список сейчас обновится. */}
      <p aria-live="polite" className="w-12 text-xs text-text-1">
        {busy && value.length > 0 ? "Ищем…" : ""}
      </p>
    </div>
  );
}

function NotificationCard({
  item,
  muted = false,
  onOpen,
}: {
  item: NotificationItemDto;
  /** Прочитанное: остаётся читаемым, но не спорит за внимание с новым. */
  muted?: boolean;
  onOpen?: () => void;
}) {
  return (
    <Link
      href={item.url}
      onClick={onOpen}
      /* Прочитанное отличается рамкой и приглушённым текстом заголовка, а не
         общей прозрачностью: `opacity-70` гасила заодно и подписи — вторичный
         текст падал до 2,9:1 вместо 4,5:1, а вместе с ним погас бы и значок
         состояния, который просили сделать заметным (VED-272). */
      className={`glass flex gap-3 rounded-2xl border p-4 transition-colors hover:border-magenta/30 ${
        muted ? "border-glass-brd/60" : "border-glass-brd"
      }`}
    >
      <span className="mt-0.5 shrink-0">
        <NotificationIcon category={item.category as NotificationCategory} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span
            className={`truncate font-medium ${muted ? "text-text-1" : "text-text-0"}`}
          >
            {item.title}
          </span>
          <span className="shrink-0 text-xs text-text-2">
            {formatWhen(item.createdAt)}
          </span>
        </span>
        {/* Ярлык «От администрации»: у остальных категорий отправитель ясен
            из самого текста («вам ответили», «заявка принята»), а
            объявление портала приходит ниоткуда, и понять, кто его прислал,
            по значку в углу не выходило.

            Золото осталось рамкой, а слова ведёт `--vm-text-1`. Раньше здесь
            стояло `bg-gold/10 text-gold`, и на светлой теме подпись давала
            2,92:1 при 11px — ниже AA. Замеры в браузере, поверх фактической
            композитной подложки карточки (стекло поверх страницы), а не
            поверх записанного `background-color`:

              bg-gold/10 + text-gold  2,92:1 светлая · 13,09:1 тёмная — мимо AA
              text-gold без заливки   3,66:1 светлая · 13,03:1 тёмная — мимо AA
              рамка + text-text-1     9,39:1 светлая ·  9,26:1 тёмная — годится

            Само золото не вытянуть: `--vm-gold` на светлой теме #B0770E даёт
            на стекле 3,66:1, и любая заливка роняет его ещё ниже. Приём тот
            же, что у значка состояния ниже (VED-272): подложку не красим,
            цвет несёт рамка. */}
        {item.category === "announcements" && (
          <span className="mt-1 inline-flex rounded-full border border-gold/60 px-2 py-0.5 text-[11px] font-medium text-text-1">
            От администрации
          </span>
        )}
        {/* `break-words` (VED-152): в текст попадают ссылки из комментариев
            — «https://github.com/…/pull/324» одним словом шире карточки на
            телефоне. Без переноса страница становилась шире экрана, Chrome
            на Android расширял под неё видимую область, и плеер, прибитый к
            её краям, уезжал вправо и вниз за экран. */}
        <span
          className={`mt-1 block break-words text-sm ${muted ? "text-text-2" : "text-text-1"}`}
        >
          {item.body}
        </span>
        {/* Значок состояния (VED-272) — справа снизу, на свободном месте
            карточки: одна и та же задача возвращается в ленту после каждой
            смены статуса, и без пометки её приходится открывать заново. */}
        {item.mark && (
          <span className="mt-2 flex justify-end">
            <NotificationMarkBadge mark={item.mark} />
          </span>
        )}
      </span>
    </Link>
  );
}

/**
 * Путь к новостям разработки.
 *
 * Уведомление живёт неделю и исчезает, а новости остаются: отсюда
 * единственная ссылка на них, кроме набранного руками адреса. Показывается и
 * над пустым списком — когда уведомлений нет, других дорог с этой страницы
 * не остаётся вовсе.
 */
function NewsLink() {
  return (
    <p className="text-sm text-text-2">
      Объявления и новости разработки целиком —{" "}
      <Link href="/updates/news" className="text-cyan hover:text-magenta">
        в разделе «Что нового»
      </Link>
      .
    </p>
  );
}
