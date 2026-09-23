"use client";

/**
 * Список уведомлений.
 *
 * Прочитанным помечается только то, что человек открыл. Раньше страница гасила
 * весь список одним запросом при загрузке: открыл одно уведомление, вернулся —
 * а остальных нет, хотя до них ещё не дошли руки. Прочитанное не исчезает
 * сразу, а лежит ниже, приглушённое, неделю; погасить всё разом можно кнопкой.
 *
 * У каждой карточки своя отметка (VED-143) — кнопка справа, в обе стороны.
 * Оптом было только «Отметить все прочитанными», а человеку нужно разобрать
 * ленту по одному: одно прочитал, к другому вернётся. Кнопка обратима, потому
 * что промахнуться по соседней карточке на телефоне проще, чем попасть.
 *
 * Нажатая карточка остаётся на месте и меняет вид, а не место: уехать в
 * «Прочитанное» по правилу VED-153 значило бы прыгнуть из-под пальца вниз за
 * экран вместе со своей кнопкой отката. Порядок применится при следующем
 * чтении ленты, удержание живёт до него (`InboxHolds` в `notifications-inbox`).
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
import { BellOff, Check, Circle, Search, X } from "lucide-react";
import type {
  NotificationItemDto,
  NotificationCategory,
} from "@vedamatch/shared";
import {
  fetchInbox,
  markInboxRead,
  setInboxItemRead,
} from "@/lib/notifications-api";
import {
  appendInboxPage,
  countUnreadItems,
  INBOX_PAGE_SIZE,
  inboxFeedFromPage,
  markInboxAllRead,
  openInboxItem,
  withFreshMarks,
  splitInbox,
  toggleInboxRead,
  withUnreadTotal,
  type InboxFeedState,
} from "@/lib/notifications-inbox";
import { setUnreadCount } from "@/lib/notifications-unread";
import { NotificationIcon } from "@/components/icons/notification-icons";
import { StatusMarkBadge } from "@/components/status-mark-badge";

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
  /**
   * Показанные карточки, удержания и счётчик — одним состоянием: нажатие на
   * кнопку карточки меняет все три разом, и разъехавшись хоть на одну
   * отрисовку, они показали бы «Новое · 5» над шестью новыми карточками.
   * `null` — ленту ещё не прочитали ни разу.
   */
  const [feed, setFeed] = useState<InboxFeedState | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  /** Что набрано в поле; в запрос уходит `applied` — после паузы. */
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [searching, setSearching] = useState(false);
  /**
   * Что сказать вслух после нажатия кнопки на карточке (VED-143). Подпись
   * кнопки меняется на противоположную, но скринридер сам её не перечитает:
   * человек услышал «Пометить прочитанным», нажал — и не узнал, получилось ли.
   * Сюда же уходит сообщение о неудаче.
   */
  const [readAnnounce, setReadAnnounce] = useState("");
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
        setFeed(inboxFeedFromPage(page));
        setNextCursor(page.nextCursor ?? null);
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

  /* Вернулись на вкладку — пометки у показанных карточек догоняют задачу
     (VED-312): «в уведомлениях Тестирование, а внутри На доработку» было и
     оттого, что открытая страница читала ленту один раз. Только пометки:
     порядок под пальцем не меняется, см. `withFreshMarks`. */
  const shownCount = feed?.items.length ?? 0;
  useEffect(() => {
    if (shownCount === 0) return;
    let inFlight = false;
    const refresh = () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      const id = requestId.current;
      void fetchInbox({
        query: applied,
        limit: Math.min(shownCount, MAX_RELOAD),
      })
        .then((page) => {
          // Пока шёл запрос, начался поиск или перечитывание — ответ не наш.
          if (id !== requestId.current) return;
          setFeed((current) =>
            current ? withFreshMarks(current, page.items) : current,
          );
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
        });
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [applied, shownCount]);

  function loadMore() {
    if (!nextCursor || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    setMoreFailed(false);
    void fetchInbox({ query: applied, cursor: nextCursor })
      .then((page) => {
        if (id !== requestId.current) return;
        setFeed((current) =>
          current ? appendInboxPage(current, page) : inboxFeedFromPage(page),
        );
        setNextCursor(page.nextCursor ?? null);
      })
      .catch(() => {
        if (id === requestId.current) setMoreFailed(true);
      })
      .finally(() => {
        if (id === requestId.current) setLoadingMore(false);
      });
  }

  /** Новое состояние ленты — и сразу же значок на колокольчике. */
  function applyFeed(next: InboxFeedState) {
    setFeed(next);
    setUnreadCount(next.unreadTotal);
  }

  /**
   * Помечаем прочитанным сразу в состоянии и не ждём сервер: переход по ссылке
   * уводит со страницы, и ответ пришёл бы уже некуда.
   */
  function markOne(id: string) {
    if (!feed) return;
    applyFeed(openInboxItem(feed, id));
    void markInboxRead([id]).catch(() => undefined);
  }

  /**
   * Кнопка на карточке (VED-143): прочитано — и обратно.
   *
   * Состояние меняется сразу, ответа не ждём: нажатие должно ощущаться
   * мгновенно, а счётчик и колокольчик — меняться вместе с ним. Ответ приносит
   * точное число непрочитанного (в другой вкладке могло прийти новое), а
   * неудача откатывает и карточку, и счётчик — тем же чистым переходом в
   * обратную сторону, чтобы откат не разошёлся с прямым ходом.
   *
   * Ленту при этом не перечитываем, и курсор остаётся годным: одна карточка
   * переезжает между потоками сервера, а дубли на границе потоков и так
   * отбрасывает `mergeInboxPages` (VED-267).
   */
  function toggleRead(id: string, read: boolean) {
    if (!feed) return;
    const next = toggleInboxRead(feed, id, read);
    if (!next.changed) return;
    applyFeed(next.state);
    setReadAnnounce(
      read ? "Уведомление отмечено прочитанным" : "Уведомление возвращено в непрочитанные",
    );
    void setInboxItemRead(id, read)
      .then((state) => {
        setFeed((current) =>
          current ? withUnreadTotal(current, state.unreadCount) : current,
        );
        setUnreadCount(state.unreadCount);
      })
      .catch(() => {
        setFeed((current) =>
          current ? toggleInboxRead(current, id, !read).state : current,
        );
        setUnreadCount(feed.unreadTotal);
        setReadAnnounce("Не удалось изменить отметку. Попробуйте ещё раз.");
      });
  }

  /**
   * Гасит всё непрочитанное — в том числе то, до чего человек не долистал.
   * Поэтому следом лента перечитывается с начала: строки переехали из первого
   * потока во второй, и прежний курсор указывает уже не туда. Просим столько
   * же карточек, сколько было показано, — место, до которого долистали, не
   * теряется.
   */
  function markAll() {
    const loaded = Math.min(Math.max(feed?.items.length ?? 0, 1), MAX_RELOAD);
    if (feed) applyFeed(markInboxAllRead(feed));
    else setUnreadCount(0);
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

  if (feed === null) return <p className="text-sm text-text-2">Загружаем…</p>;

  const { items, holds, unreadTotal } = feed;
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

  const { unread, read } = splitInbox(items, holds);

  return (
    <div className="space-y-6">
      {searchBox}

      {/* Итог нажатия кнопки на карточке — вслух. Пустая область живёт в
          разметке всегда: создать её вместе с сообщением значит не дать
          скринридеру её заметить. */}
      <p aria-live="polite" className="sr-only">
        {readAnnounce}
      </p>

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
                <NotificationCard
                  item={item}
                  onOpen={() => markOne(item.id)}
                  onToggleRead={(read) => toggleRead(item.id, read)}
                />
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
                <NotificationCard
                  item={item}
                  // Открытие прочитанного — тоже контакт (VED-404): оно
                  // поднимается в истории уведомлений.
                  onOpen={() => markOne(item.id)}
                  onToggleRead={(next) => toggleRead(item.id, next)}
                />
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

/**
 * Карточка ленты.
 *
 * Ссылка больше не обнимает карточку целиком: рядом с ней стоит кнопка
 * отметки (VED-143), а кнопку внутрь `<a>` не положить — это вложенные
 * интерактивные элементы, и клавиатура с скринридером на них спотыкаются.
 * Поэтому рамка и стекло переехали на обёртку, а ссылкой осталась содержимая
 * часть — то, по чему человек и целится, когда хочет открыть уведомление.
 */
export function NotificationCard({
  item,
  onOpen,
  onToggleRead,
  when,
}: {
  item: NotificationItemDto;
  onOpen?: () => void;
  /** Нажали кнопку отметки; `read` — в какую сторону. */
  onToggleRead?: (read: boolean) => void;
  /**
   * Подпись времени вместо «когда пришло». История уведомлений (VED-404)
   * показывает время контакта: день уже назван заголовком её группы.
   */
  when?: string;
}) {
  /* Прочитанное приглушено по своему же `readAt`, а не по тому, в какой группе
     оно показано: нажатую карточку мы держим на месте (VED-143), и узнать, что
     отметка встала, человек может только по её виду. */
  const muted = item.readAt !== null;
  return (
    <div
      /* Прочитанное отличается рамкой и приглушённым текстом заголовка, а не
         общей прозрачностью: `opacity-70` гасила заодно и подписи — вторичный
         текст падал до 2,9:1 вместо 4,5:1, а вместе с ним погас бы и значок
         состояния, который просили сделать заметным (VED-272). */
      className={`glass flex items-start gap-1 rounded-2xl border p-4 transition-colors hover:border-magenta/30 ${
        muted ? "border-glass-brd/60" : "border-glass-brd"
      }`}
    >
      <Link
        href={item.url}
        onClick={onOpen}
        className="flex min-w-0 flex-1 gap-3"
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
            {/* `--vm-text-1`, а не `--vm-text-2`: на стекле тёмной темы
                второй давал 4,07–4,14:1 при 12px, ниже AA (замер VED-404). */}
            <span className="shrink-0 text-xs text-text-1">
              {when ?? formatWhen(item.createdAt)}
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
              её краям, уезжал вправо и вниз за экран.

              Текст прочитанного — `--vm-text-1`, как у нового: `--vm-text-2`
              на стекле тёмной темы давал 4,05:1 при 14px, ниже AA, а история
              уведомлений (VED-404) состоит из одного прочитанного. Прочитанное
              и так отличается приглушённым заголовком, бледной рамкой и
              галкой в кружке справа. */}
          <span className="mt-1 block break-words text-sm text-text-1"
          >
            {item.body}
          </span>
          {/* Значок состояния (VED-272) — справа снизу, на свободном месте
              карточки: одна и та же задача возвращается в ленту после каждой
              смены статуса, и без пометки её приходится открывать заново. */}
          {item.mark && (
            <span className="mt-2 flex justify-end">
              <StatusMarkBadge mark={item.mark} />
            </span>
          )}
        </span>
      </Link>
      {onToggleRead && <ReadToggle read={muted} onToggle={onToggleRead} />}
    </div>
  );
}

/**
 * Своя отметка прочтения у карточки (VED-143).
 *
 * Состояние видно по самому знаку, а не по его цвету: у прочитанного внутри
 * кружка стоит галка, у непрочитанного кружок пуст. Цветом состояние не
 * различается вовсе — оба знака ведёт `--vm-text-1`, — так что признак
 * переживает и чёрно-белую печать, и дальтонизм, и подслеповатый экран на
 * солнце. Разница цветом на карточке всё равно остаётся (приглушённый
 * заголовок, бледная рамка), но она здесь вторая примета, а не единственная.
 *
 * Подпись называет действие, а не состояние: «Пометить прочитанным» и
 * «Вернуть в непрочитанные». `aria-pressed` намеренно нет — с ним скринридер
 * читал бы «Пометить прочитанным, нажато», и понять, прочитано ли
 * уведомление, стало бы вдвое труднее. Что отметка встала, говорит область
 * `aria-live` в списке.
 *
 * 44×44 — тап-цель: кнопка стоит вплотную к ссылке, которая уводит со
 * страницы, и промах по ней стоит человеку потерянного места в ленте. Эти
 * сорок четыре пикселя кнопка отбирает у заголовка, и на телефоне это видно:
 * `-mr-2 -mt-1` возвращают часть, заезжая в поле карточки — место там всё
 * равно пустое, а укоротить саму цель нельзя.
 */
function ReadToggle({
  read,
  onToggle,
}: {
  read: boolean;
  onToggle: (read: boolean) => void;
}) {
  const label = read ? "Вернуть в непрочитанные" : "Пометить прочитанным";
  return (
    <button
      type="button"
      onClick={() => onToggle(!read)}
      aria-label={label}
      title={label}
      className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-1 transition-colors hover:bg-glass hover:text-text-0"
    >
      {read ? (
        // Кружок с галкой рисуем двумя фигурами, а не готовым `CircleCheck`:
        // у того галка вписана внутрь обводки и на 20 пикселях сливается с
        // ней в пятно.
        <span className="relative flex h-5 w-5 items-center justify-center">
          <Circle className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          <Check
            className="absolute h-3 w-3"
            strokeWidth={3}
            aria-hidden="true"
          />
        </span>
      ) : (
        <Circle className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      )}
    </button>
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
