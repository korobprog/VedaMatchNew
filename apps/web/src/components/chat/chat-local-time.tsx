"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Время в часовом поясе читателя. Сервер рендерит в UTC, браузер — в своём
 * поясе, и «14:05» с сервера против «17:05» в браузере роняли гидрацию
 * списка бесед (React #418). Поэтому при серверном рендере и гидрации
 * текста нет, а сразу после — время по часам устройства. При переходе
 * внутри приложения гидрации нет, и время видно с первого кадра.
 */
export function ChatLocalTime({
  iso,
  format,
  className,
}: {
  iso: string | null | undefined;
  format: (iso: string) => string;
  className?: string;
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!iso) return null;
  return (
    <time dateTime={iso} className={className}>
      {hydrated ? format(iso) : ""}
    </time>
  );
}
