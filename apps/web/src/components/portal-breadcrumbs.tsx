"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServiceNames } from "@/components/service-catalog-provider";
import {
  buildPortalPath,
  pageTitleForCrumb,
  portalBreadcrumbsHidden,
} from "@/lib/portal-path";

/**
 * Заголовок текущей страницы — для последнего шага пути (VED-92).
 *
 * Запросов не делаем: имя записи или человека страница уже положила в
 * `<title>`. Next меняет его не в момент смены адреса, а когда дорисует
 * новую страницу, поэтому за `<title>` следим наблюдателем. Заголовок,
 * который висел на прошлом адресе, не берём: пока новая страница его не
 * сменила, это имя чужой страницы.
 */
function usePageTitle(pathname: string): string | null {
  const [state, setState] = useState<{ path: string; title: string | null }>({
    path: pathname,
    title: null,
  });
  // Заголовок, увиденный на прошлом адресе; `undefined` — прошлого не было,
  // и первый же заголовок (загрузка страницы целиком) — свой.
  const seenRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const stale = seenRef.current;
    let settled = false;
    const read = () => {
      const title = pageTitleForCrumb(document.title);
      if (!settled && stale !== undefined && title === stale) return;
      // Шапку трогают и стили, и мета-теги: без смены заголовка — не рисуем.
      if (settled && title === seenRef.current) return;
      settled = true;
      seenRef.current = title;
      setState({ path: pathname, title });
    };
    // Заголовок мог смениться ещё до эффекта — тогда он уже свой.
    const timer = window.setTimeout(read, 0);
    const observer = new MutationObserver(read);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [pathname]);

  return state.path === pathname ? state.title : null;
}

/**
 * Тонкая строка пути по порталу (VED-92): «Главная › Маркет › Заказы ›
 * Заказ», как путь в файловом менеджере. Каждый шаг, кроме текущего, —
 * ссылка. На телефоне строка листается вбок без полосы и открывается
 * прокрученной к концу: текущий шаг важнее Главной.
 *
 * Рисуется шапкой портала, сразу под ней: где нет шапки (лента
 * Вдохновения, лендинг), нет и пути. Своя высота — в `--vm-crumbs-space`
 * (globals.css), её вычитают раскладки, считающие высоту от окна.
 */
export function PortalBreadcrumbs() {
  const pathname = usePathname() ?? "/";
  const t = useTranslations("Header");
  const tCommon = useTranslations("Common");
  const names = useServiceNames();
  const title = usePageTitle(pathname);
  const home = tCommon("home");
  const hidden = portalBreadcrumbsHidden(pathname);
  const crumbs = useMemo(
    () =>
      hidden ? [] : buildPortalPath(pathname, { resolve: names, home, title }),
    [hidden, pathname, names, home, title],
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, [crumbs]);

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label={t("breadcrumbs")}
      data-portal-breadcrumbs=""
      className="border-b border-glass-brd bg-bg-0"
    >
      <div
        ref={scrollRef}
        className="scroll-slim mx-auto max-w-6xl overflow-x-auto px-4"
      >
        <ol className="flex h-8 w-max min-w-full items-center gap-1 whitespace-nowrap text-xs text-text-2">
          {crumbs.map((crumb, index) => (
            <li key={index} className="flex items-center gap-1">
              {index > 0 && (
                <span aria-hidden="true" className="select-none px-0.5">
                  ›
                </span>
              )}
              {crumb.current ? (
                <span aria-current="page" className="font-medium text-text-1">
                  {crumb.label}
                </span>
              ) : crumb.href ? (
                <Link
                  href={crumb.href}
                  className="rounded px-0.5 transition-colors hover:text-text-0"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
