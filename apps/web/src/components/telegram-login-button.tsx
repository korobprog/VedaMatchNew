"use client";

import { useEffect, useRef } from "react";
import { apiBase } from "@/lib/api-base";

/** Совпадает с дефолтом на API (`@vedamatch_bot`) — используется, только
 *  если сборка не задала свой бот переменной окружения. */
const DEFAULT_BOT = "vedamatch_bot";

/**
 * Официальный «Telegram Login Widget» (core.telegram.org/widgets/login) —
 * кнопка входа на самом сайте, НЕ мини-приложение. Проверяет её другой
 * эндпоинт API с другим секретом подписи, см. комментарий в
 * `apps/api/src/modules/auth/telegram-login-widget.ts`.
 *
 * Виджет — сторонний `<script>`, который сам вставляет `<iframe>` кнопки
 * рядом с собой после загрузки; декларативным JSX такое не собрать, поэтому
 * скрипт создаётся императивно в `useEffect` и монтируется в контейнер по
 * ref. `data-auth-url` ведёт на `/auth/telegram/callback` — Telegram сам
 * откроет её редиректом браузера, дописав свои поля к уже готовому адресу
 * (`returnTo` остаётся на месте, см. `verifyTelegramWidget`).
 *
 * Контейнер держит фиксированную минимальную высоту, равную высоте соседних
 * кнопок (`h-11`, как `py-3` + текст в LoginCard): без неё асинхронная
 * загрузка `<iframe>` сдвигала бы форму входа после отрисовки.
 */
export function TelegramLoginButton({
  returnTo,
  className,
}: {
  returnTo?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT || DEFAULT_BOT;
    const authUrl = new URL(`${apiBase()}/auth/telegram/callback`);
    if (returnTo && returnTo !== "/") {
      authUrl.searchParams.set("returnTo", returnTo);
    }

    // Тема на момент монтирования — виджет не следит за переключателем
    // портала сам, а полноценная реактивность здесь не стоит сложности
    // MutationObserver ради кнопки, которую переключают на входе один раз.
    const theme = document.documentElement.getAttribute("data-theme");

    container.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", bot);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-auth-url", authUrl.toString());
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-color-scheme", theme === "dark" ? "dark" : "light");
    container.appendChild(script);
  }, [returnTo]);

  return (
    <div
      ref={containerRef}
      data-testid="telegram-login-widget"
      className={
        className ??
        "flex min-h-11 w-full items-center justify-center rounded-xl"
      }
    />
  );
}
