"use client";

import type { MouseEvent, ReactNode } from "react";
import { useCallback } from "react";
import { toTelegramAppLink } from "./telegram-link";

/** Сколько ждём переключения на приложение, прежде чем уйти на сайт. */
const APP_SWITCH_MS = 1200;

/**
 * Ссылка на материал за пределами портала. Для Telegram сначала пробуем
 * открыть приложение схемой `tg://`.
 *
 * Обычный переход по `t.me` в установленном портале заканчивался белым
 * экраном: новую вкладку окну без вкладок показать негде, а сама страница
 * `t.me` умеет только попросить открыть приложение — и просить некого. У части
 * операторов домен вдобавок рвётся на уровне сети (ERR_CONNECTION_ABORTED).
 *
 * Если приложения нет, `tg://` не сделает ничего — вкладка останется на месте,
 * и через APP_SWITCH_MS мы уводим на обычный адрес. Уходим в той же вкладке:
 * `window.open` из таймера, уже без жеста пользователя, режут блокировщики.
 * Цена приёма — на iOS без установленного Telegram система успевает показать
 * «не удаётся открыть страницу» до того, как сработает запасной переход.
 *
 * Для остальных адресов — а их в Образовании большинство — ведёт себя как
 * обычная внешняя ссылка.
 */
export function OutsideLink({
  href,
  className,
  children,
  ...rest
}: {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const appLink = toTelegramAppLink(href);

  const openViaApp = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      // Ctrl/Cmd-клик, средняя кнопка и «открыть в новой вкладке» должны
      // остаться обычным переходом по href.
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      if (event.button !== 0) return;
      if (!appLink) return;

      event.preventDefault();

      let done = false;
      const cancel = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        document.removeEventListener("visibilitychange", onHide);
        window.removeEventListener("pagehide", cancel);
      };
      const onHide = () => {
        // Страница ушла в фон — значит, приложение открылось.
        if (document.visibilityState === "hidden") cancel();
      };
      const timer = window.setTimeout(() => {
        if (done) return;
        cancel();
        window.location.assign(href);
      }, APP_SWITCH_MS);

      document.addEventListener("visibilitychange", onHide);
      window.addEventListener("pagehide", cancel);
      window.location.assign(appLink);
    },
    [appLink, href],
  );

  return (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={openViaApp}
    >
      {children}
    </a>
  );
}
