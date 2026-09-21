"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  hydratePortalWindows,
  notePortalNavigation,
  notePortalScroll,
  takePendingScroll,
} from "./portal-windows-store";

/**
 * Следит за переходами портала и складывает их в историю активного окна
 * (VED-118).
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
  const query = searchParams.toString();
  const url = query ? `${pathname}?${query}` : pathname;

  useEffect(() => {
    hydratePortalWindows(url);
    notePortalNavigation(url);
    const scroll = takePendingScroll(url);
    if (scroll === null) return;
    // Роутер сам возвращает страницу наверх после перехода, поэтому своё
    // положение восстанавливаем следующим кадром — иначе он его перетрёт.
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: scroll, behavior: "instant" as ScrollBehavior });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [url]);

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
