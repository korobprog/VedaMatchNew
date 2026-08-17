"use client";

import { useId } from "react";

/**
 * Знак VedaMatch: земной шар над «M» из двух горных шевронов.
 *
 * Векторная замена logo_tilak.png. Растр нарисован тёмно-синим (#26356B) по
 * прозрачному фону — на тёмной теме портала он сливается с подложкой, и
 * подсветить его нечем: цвет запечён в пиксели.
 *
 * Здесь «M» рисуется `currentColor`, поэтому берёт цвет текста родителя:
 * почти чёрный на светлой теме, почти белый на тёмной. Глобус оставлен
 * цветным — он и есть то, что делает знак узнаваемым, и синий с зелёным
 * читаются на обоих фонах.
 *
 * Идентификаторы градиентов разведены через `useId`: ссылки `url(#…)`
 * резолвятся по всему документу, и два знака на странице (шапка и меню)
 * иначе перебивали бы друг другу заливку.
 */
export function VedaMatchMark({
  className = "h-8 w-8",
  title = "VedaMatch",
}: {
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gid = (name: string) => `vm-mark-${name}-${uid}`;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      {/* Глобус. Поднят к верхней кромке: в оригинале он парит над «M»,
          и зазор между ними — часть узнаваемости знака. cy=11, а не 13, —
          выше предыдущей версии на 2 пункта, той же правкой, что и здесь. */}
      <circle cx="32" cy="11" r="10.5" fill={`url(#${gid("ocean")})`} />
      {/* Материки: не карта, а намёк на неё — на 20 px точность всё равно
          не различима, а лишние детали превращаются в грязь. */}
      <path
        d="M25.5 5.5c2.4-.6 4 .8 5.6.3 1.5-.5 2.4-2 4-1.6 1.3.3 1.6 1.7.8 2.6-1 1.1-3 .9-3.6 2.2-.5 1.2.8 2.2.3 3.4-.6 1.4-3 1.2-3.8 2.5-.7 1.2.3 2.7-.5 3.7-.8 1-2.5.6-3.4-.3-1.6-1.6-2.2-4.2-1.8-6.4.3-2 1-4.3 2.4-6.4Z"
        fill={`url(#${gid("land")})`}
      />
      <path
        d="M38.5 10.6c1.3-.3 2.6.4 3.3 1.5.7 1.1.6 2.7-.3 3.6-.8.8-2.2.9-3 .2-1-.9-1.2-2.6-.6-3.8.2-.5.4-1 .6-1.5Z"
        fill={`url(#${gid("land")})`}
      />
      {/* Меридиан: одна дуга уже читается как сфера, целая сетка на малом
          размере сливается в шум. */}
      <path
        d="M32 0.5c3.2 3 5 6.6 5 10.5s-1.8 7.5-5 10.5"
        stroke="#BFDBFE"
        strokeOpacity="0.55"
        strokeWidth="1.1"
        fill="none"
      />
      <circle
        cx="32"
        cy="11"
        r="10.5"
        stroke={`url(#${gid("rim")})`}
        strokeWidth="1.4"
        fill="none"
      />

      {/* «M» из горных шевронов. Цвет берётся из токена темы, а не из
          --vm-text-0: на белом фоне почти чёрная «M» тяжелее остального
          интерфейса, и там знак носит фирменный синий. `currentColor` в
          запасе — если знак вставят вне портальной темы. */}
      <path
        d="M5 57 L22 28 L32 45 L42 28 L59 57"
        stroke="var(--vm-logo-mark, currentColor)"
        strokeWidth="6"
        strokeLinejoin="miter"
        strokeLinecap="butt"
        fill="none"
      />
      {/* Внутренний шеврон — тот самый двойной контур оригинала. */}
      <path
        d="M22.5 32.5 L32 49 L41.5 32.5"
        stroke="var(--vm-logo-mark, currentColor)"
        strokeWidth="4.5"
        strokeLinejoin="miter"
        strokeLinecap="butt"
        fill="none"
        opacity="0.55"
      />

      <defs>
        <linearGradient
          id={gid("ocean")}
          x1="22"
          y1="1"
          x2="42"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2563EB" />
          <stop offset="1" stopColor="#1E3A8A" />
        </linearGradient>
        <linearGradient
          id={gid("land")}
          x1="24"
          y1="4"
          x2="40"
          y2="19"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4ADE80" />
          <stop offset="1" stopColor="#15803D" />
        </linearGradient>
        <linearGradient
          id={gid("rim")}
          x1="22"
          y1="1"
          x2="42"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#93C5FD" stopOpacity="0.9" />
          <stop offset="1" stopColor="#1E40AF" stopOpacity="0.5" />
        </linearGradient>
      </defs>
    </svg>
  );
}
