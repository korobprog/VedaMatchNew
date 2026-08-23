"use client";

import { useState } from "react";
import type { InviteService } from "@/lib/rewards-share";

/**
 * Готовый текст приглашения. Человек, которому дали одну голую ссылку, пишет
 * другу сам — и чаще всего не пишет вовсе. Здесь текст уже собран: чем
 * портал полезен, что даёт регистрация по ссылке и куда идти.
 *
 * Текст приходит готовым из серверного компонента, потому что собирается из
 * каталога сервисов; здесь только копирование и отправка.
 */
export function RewardsInviteMessage({
  message,
  services,
}: {
  message: string;
  services: InviteService[];
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер закрыт настройками браузера — текст на экране, его видно
      // целиком и можно выделить руками.
      setCopied(false);
    }
  }

  return (
    <section className="glass mb-6 rounded-2xl border border-glass-brd p-6">
      <h2 className="mb-1 font-display text-lg font-semibold text-text-0">
        Текст приглашения
      </h2>
      <p className="mb-4 font-body text-sm text-text-1">
        Готовое сообщение со ссылкой и коротким описанием сервисов — его
        достаточно вставить в переписку.
      </p>

      {/* Текст показан целиком, а не свёрнут: человек отправляет его от своего
          имени и вправе прочитать, прежде чем нажать «Скопировать». */}
      <p className="whitespace-pre-line rounded-xl border border-glass-brd bg-bg-2 px-4 py-3 font-body text-sm leading-relaxed text-text-0">
        {message}
      </p>

      {/* Кнопок мессенджеров здесь нет намеренно: они уже стоят у ссылки
          выше, и вторая такая же пара на одном экране читается как повтор.
          Скопированный текст вставляется куда угодно, включая почту и СМС. */}
      <button
        type="button"
        onClick={() => void copy()}
        className="btn-mint mt-4 rounded-xl px-4 py-2 font-body text-sm font-medium"
      >
        {copied ? "Скопировано" : "Скопировать текст"}
      </button>

      <p role="status" aria-live="polite" className="sr-only">
        {copied ? "Текст приглашения скопирован" : ""}
      </p>

      {services.length === 0 && (
        <p className="mt-3 font-body text-sm text-text-1">
          Каталог сервисов сейчас недоступен — в тексте только приглашение и
          ссылка.
        </p>
      )}
    </section>
  );
}
