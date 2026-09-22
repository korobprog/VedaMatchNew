"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  PORTAL_SEQ_KEY,
  historyEntrySeq,
  historyStepDirection,
} from "@/lib/portal-history-seq";
import {
  SCROLL_RESTORE_POLL_MS,
  scrollReach,
  stepScrollRestore,
} from "@/lib/scroll-restore";
import {
  hydratePortalWindows,
  notePortalNavigation,
  notePortalScroll,
  setPortalScrollRestoring,
  stepPortalHistory,
  takePendingScroll,
} from "./portal-windows-store";

/**
 * Следит за переходами портала и складывает их в историю активного окна
 * (VED-118), возвращает страницу на запомненное место (VED-325) и разбирает
 * аппаратную кнопку «назад» (VED-354).
 *
 * Живёт в корневом layout, а не в группе `(portal)`: шапка с панелью
 * горячих кнопок рисуется и на страницах вне этой группы (Образование,
 * Вдохновение, поиск), и окно, потерявшее там свою историю, вело бы себя
 * загадочно.
 */
export function PortalWindowsTracker() {
  return (
    // `useSearchParams` без Suspense переводит всю страницу в клиентскую
    // отрисовку — граница нужна именно здесь, а не у страниц.
    <Suspense fallback={null}>
      <Tracker />
    </Suspense>
  );
}

function Tracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.toString();
  const url = query ? `${pathname}?${query}` : pathname;

  useEffect(() => {
    hydratePortalWindows(url);
    markHistoryEntry();
    notePortalNavigation(url);
    const target = takePendingScroll(url);
    if (target === null) return;
    return restoreScroll(target);
  }, [url]);

  /*
    Аппаратная кнопка «назад» (VED-354).

    История браузера во вкладке одна на оба окна, и «назад» уводил в соседнее
    окно вместо шага назад в текущем. Браузер уже сместился и сообщил, куда
    попал; портал сверяется со своей историей и, если это чужое окно,
    поправляет адрес на свой. `replace`, а не `push`: шаг назад не обязан
    оставлять за собой запись «вперёд».
  */
  useEffect(() => {
    const onPop = () => {
      const landed = `${window.location.pathname}${window.location.search}`;
      const seq = historyEntrySeq(window.history.state);
      const direction = historyStepDirection(seq, currentSeq);
      // Запись, на которую попали, свой номер уже имеет; наш `replace` его
      // сотрёт, поэтому запоминаем и вернём тот же — иначе исправленный шаг
      // окажется «новее» соседей и следующее нажатие разберётся наоборот.
      currentSeq = seq;
      keepSeq = seq;
      const fix = stepPortalHistory(landed, direction);
      if (fix) router.replace(fix);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [router]);

  // Прокрутку запоминаем не на каждый пиксель, а по остановке: запись в
  // sessionStorage на каждом кадре прокрутки — заметная работа на телефоне.
  useEffect(() => {
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => notePortalScroll(window.scrollY), 200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}

/**
 * Номер записи истории, на которой стоим, и номер, который надо вернуть
 * записи после собственного `replace`. Модулем, а не состоянием React:
 * читаются из слушателя `popstate` и из эффекта перехода, а перерисовки от
 * них не зависит ничего (см. `portal-history-seq.ts`).
 */
let currentSeq: number | null = null;
let keepSeq: number | null = null;

/** Счётчик переживает перезагрузку: `history.state` прошлых записей — тоже. */
const SEQ_KEY = "vedamatch:portal-history-seq";

/**
 * Пометить запись истории своим номером — по нему потом видно, назад
 * шагнули или вперёд. Уже помеченную не трогаем: её номер и есть ответ.
 */
function markHistoryEntry(): void {
  const state = window.history.state as Record<string, unknown> | null;
  const existing = historyEntrySeq(state);
  if (existing !== null && keepSeq === null) {
    currentSeq = existing;
    return;
  }
  const next = keepSeq ?? nextSeq();
  keepSeq = null;
  currentSeq = next;
  try {
    window.history.replaceState(
      { ...(state ?? {}), [PORTAL_SEQ_KEY]: next },
      "",
    );
  } catch {
    // Номера не будет — «назад» разберётся как «назад», и это верно почти
    // всегда (см. `historyStepDirection`).
  }
}

function nextSeq(): number {
  let last = 0;
  try {
    last = Number(window.sessionStorage.getItem(SEQ_KEY)) || 0;
  } catch {
    last = currentSeq ?? 0;
  }
  const next = Math.max(last, currentSeq ?? 0) + 1;
  try {
    window.sessionStorage.setItem(SEQ_KEY, String(next));
  } catch {
    // Приватный режим: номера живут до перезагрузки.
  }
  return next;
}

/**
 * Вернуть страницу на запомненное место (VED-325).
 *
 * Не один кадр, а попытки, пока страница не дорастёт до нужной высоты:
 * список задач, лента и каталог приезжают запросом, и в первый кадр после
 * перехода прокручивать ещё некуда — браузер молча прижимает к нулю.
 * Правило одной попытки — в `lib/scroll-restore.ts`, здесь кадры и слушатели.
 *
 * Человек, взявшийся за страницу сам, попытки прекращает: догонять его
 * рывком вниз хуже, чем не доехать.
 */
function restoreScroll(target: number): () => void {
  const started = performance.now();
  let timer = 0;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("keydown", stop);
    setPortalScrollRestoring(false);
  };

  const tick = () => {
    if (stopped) return;
    const { top, done } = stepScrollRestore({
      target,
      reach: scrollReach(
        document.documentElement.scrollHeight,
        window.innerHeight,
      ),
      elapsed: performance.now() - started,
    });
    if (top !== null && Math.abs(window.scrollY - top) > 1) {
      window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
    }
    if (done) {
      stop();
      return;
    }
    timer = window.setTimeout(tick, SCROLL_RESTORE_POLL_MS);
  };

  setPortalScrollRestoring(true);
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("keydown", stop);
  // Первую попытку — следующим кадром: роутер сам возвращает страницу
  // наверх сразу после перехода и перетёр бы наше положение.
  timer = window.setTimeout(tick, 0);
  return stop;
}
