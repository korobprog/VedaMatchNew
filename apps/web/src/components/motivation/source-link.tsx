"use client";

import type { ReactNode } from "react";
import { useCallback } from "react";
import { toTelegramAppLink } from "./telegram-link";

/** Сколько ждём переключения на приложение, прежде чем уйти на сайт. */
const APP_SWITCH_MS = 1200;

/**
 * Ссылка на источник поста. Для Telegram сначала пробуем открыть приложение
 * схемой `tg://`: сайт `t.me` у части операторов рвётся на уровне сети, и
 * обычный переход у таких пользователей заканчивается ERR_CONNECTION_ABORTED.
 *
 * Если приложения нет, `tg://` не сделает ничего — вкладка останется на месте,
 * и через APP_SWITCH_MS мы уводим на обычный адрес. Уходим в той же вкладке:
 * `window.open` из таймера, уже без жеста пользователя, режут блокировщики.
 * Цена приёма — на iOS без установленного Telegram система успевает показать
 * «не удаётся открыть страницу» до того, как сработает запасной переход.
 *
 * Для не-Telegram адресов ведёт себя как обычная внешняя ссылка.
 */
export function SourceLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const appLink = toTelegramAppLink(href);

  const openViaApp = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
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
        window.location.href = href;
      }, APP_SWITCH_MS);

      document.addEventListener("visibilitychange", onHide);
      window.addEventListener("pagehide", cancel);
      window.location.href = appLink;
    },
    [appLink, href],
  );

  return (
    <a
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
