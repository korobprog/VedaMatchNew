"use client";

import React, { useId } from "react";
import { ServiceIcon } from "./service-icons";
import type { NotificationCategory } from "@vedamatch/shared";

/**
 * Иконки уведомлений — свои, а не из библиотеки.
 *
 * Уведомление приходит от конкретного сервиса, и человек узнаёт его по тому же
 * знаку, что видит на карточке портала и в шапке: серая скрепка из общего
 * набора этого не даёт. Поэтому сервисные категории берут `ServiceIcon` —
 * ровно тот рисунок, что стоит у сервиса, — а две оставшиеся, разговор и
 * поддержка, нарисованы здесь: своих сервисов у них нет.
 *
 * Идентификаторы градиентов разводятся через `useId`: ссылки `url(#…)` в SVG
 * ищутся по всему документу, и одинаковый id позволил бы одной иконке
 * перекрасить другую.
 */

const SERVICE_SLUGS: Partial<Record<NotificationCategory, string>> = {
  motivation: "motivation",
  market: "market",
  notices: "notices",
  // Транзиты считает Астрология, знакомства и переписка живут в Union.
  transits: "astro",
  connections: "union",
};

export function NotificationIcon({
  category,
  className = "h-7 w-7",
}: {
  category: NotificationCategory;
  className?: string;
}) {
  const slug = SERVICE_SLUGS[category];
  if (slug) return <ServiceIcon slug={slug} className={className} />;
  if (category === "support") return <SupportIcon className={className} />;
  if (category === "announcements") return <PortalIcon className={className} />;
  return <ChatIcon className={className} />;
}

/**
 * Новость от администрации: гора-«М» из знака портала внутри круга.
 *
 * Не логотип файлом: он цветной и с подложкой, а в строке уведомления нужен
 * тот же силуэт в один тон, чтобы читался рядом с сервисными знаками.
 */
export function PortalIcon({ className = "h-7 w-7" }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gid = (name: string) => `portal-${name}-${uid}`;
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        fill={`url(#${gid("bg")})`}
        stroke={`url(#${gid("stroke")})`}
        strokeWidth="1.6"
      />
      {/* Две вершины — знак VedaMatch */}
      <path
        d="M8 21.5 13 12l3.2 5.6L19 12.8l5 8.7H8Z"
        fill="#FFFFFF"
        fillOpacity="0.92"
      />
      {/* Солнце над хребтом */}
      <circle cx="21.5" cy="9.5" r="2.2" fill="#FFE07A" />
      <defs>
        <linearGradient id={gid("bg")} x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B23EFF" stopOpacity="0.85" />
          <stop offset="1" stopColor="#FF3E9E" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={gid("stroke")} x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D896FF" />
          <stop offset="1" stopColor="#FF85C0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Обратная связь: оператор в гарнитуре.
 *
 * Отличается от `SupportIcon` намеренно: ладонь означает пришедший ответ, а
 * человек в наушниках — что на той стороне кто-то есть и ему можно написать.
 * Первая стоит в списке уведомлений, вторая — на кнопке.
 */
export function HeadsetIcon({ className = "h-7 w-7" }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gid = (name: string) => `headset-${name}-${uid}`;
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Дуга гарнитуры над головой */}
      <path
        d="M7.5 18v-2.5a8.5 8.5 0 0 1 17 0V18"
        stroke={`url(#${gid("stroke")})`}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Чашки: левая с микрофоном на штанге */}
      <rect
        x="4.5"
        y="16.5"
        width="4.5"
        height="7"
        rx="2.2"
        fill={`url(#${gid("cup")})`}
      />
      <rect
        x="23"
        y="16.5"
        width="4.5"
        height="7"
        rx="2.2"
        fill={`url(#${gid("cup")})`}
      />
      <path
        d="M6.7 23.5v1.2a2.5 2.5 0 0 0 2.5 2.5H13"
        stroke={`url(#${gid("stroke")})`}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      {/* Голова и плечи: без них гарнитура висит сама по себе */}
      <circle cx="16" cy="14" r="3.4" fill="#FFFFFF" fillOpacity="0.92" />
      <path
        d="M10.5 27c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"
        stroke="#FFFFFF"
        strokeOpacity="0.92"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id={gid("cup")} x1="4" y1="16" x2="28" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5EE7C5" />
          <stop offset="1" stopColor="#2AA88C" />
        </linearGradient>
        <linearGradient id={gid("stroke")} x1="4" y1="7" x2="28" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9CF7E2" />
          <stop offset="1" stopColor="#3FC7A8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Поддержка: раскрытая ладонь под каплей-искрой.
 *
 * Мятная, а не малиновая, как остальные: ответ поддержки — единственное
 * уведомление, которое человек ждёт от людей, а не от сервиса, и в списке оно
 * должно находиться взглядом сразу.
 */
export function SupportIcon({ className = "h-7 w-7" }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gid = (name: string) => `support-${name}-${uid}`;
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Ладонь */}
      <path
        d="M7 18c0-1.2 1-2.2 2.2-2.2.7 0 1.3.3 1.8.8V11c0-1.2 1-2.2 2.2-2.2s2.2 1 2.2 2.2v-.8c0-1.2 1-2.2 2.2-2.2s2.2 1 2.2 2.2V12c0-1.2 1-2.2 2.2-2.2S24 10.8 24 12v6.5c0 3.9-3.2 7-7 7h-1.4c-2 0-3.9-.9-5.2-2.4L7.6 19.6A2.2 2.2 0 0 1 7 18Z"
        fill={`url(#${gid("bg")})`}
        stroke={`url(#${gid("stroke")})`}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Линии пальцев: без них ладонь читается как варежка */}
      <path
        d="M15.4 15.6V11m3.6 4.6v-3.4"
        stroke="#0B2F27"
        strokeOpacity="0.35"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {/* Искра над ладонью — то, ради чего руку и протягивают */}
      <path
        d="M20.5 4.5c.5 1.6 1.2 2.3 2.8 2.8-1.6.5-2.3 1.2-2.8 2.8-.5-1.6-1.2-2.3-2.8-2.8 1.6-.5 2.3-1.2 2.8-2.8Z"
        fill="#FFE07A"
      />
      <defs>
        <linearGradient id={gid("bg")} x1="7" y1="8" x2="24" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5EE7C5" stopOpacity="0.85" />
          <stop offset="1" stopColor="#2AA88C" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={gid("stroke")} x1="7" y1="8" x2="24" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9CF7E2" />
          <stop offset="1" stopColor="#3FC7A8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Разговор: два облака реплик, ближнее перекрывает дальнее. */
export function ChatIcon({ className = "h-7 w-7" }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gid = (name: string) => `chat-${name}-${uid}`;
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Дальняя реплика */}
      <path
        d="M11 6h13a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-1v3.5L19 18h-8a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z"
        fill={`url(#${gid("far")})`}
        stroke={`url(#${gid("stroke")})`}
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.55"
      />
      {/* Ближняя: смещена вниз-влево, чтобы читалась пара, а не одно облако */}
      <path
        d="M8 13h11a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-6l-4.5 3.5V24H8a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3Z"
        fill={`url(#${gid("near")})`}
        stroke={`url(#${gid("stroke")})`}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Три точки: реплика, а не пустая рамка */}
      <circle cx="10.5" cy="18.5" r="1.2" fill="#FFF" fillOpacity="0.9" />
      <circle cx="14" cy="18.5" r="1.2" fill="#FFF" fillOpacity="0.9" />
      <circle cx="17.5" cy="18.5" r="1.2" fill="#FFF" fillOpacity="0.9" />
      <defs>
        <linearGradient id={gid("far")} x1="8" y1="6" x2="27" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B23EFF" stopOpacity="0.8" />
          <stop offset="1" stopColor="#6E4BFF" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id={gid("near")} x1="5" y1="13" x2="22" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF3E9E" stopOpacity="0.85" />
          <stop offset="1" stopColor="#B23EFF" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={gid("stroke")} x1="5" y1="6" x2="27" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF85C0" />
          <stop offset="1" stopColor="#D896FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}
