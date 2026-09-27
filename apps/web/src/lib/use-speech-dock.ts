"use client";

/**
 * Хуки пульта озвучки (VED-569). Вынесены из `speech-dock.ts`, чтобы сам
 * стор оставался без React: его импортируют сервисные «дикторы», а их —
 * серверные страницы (например, `buildSpokenEntry` на странице материала).
 */
import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import {
  getSpeechSession,
  getSpeechSessionServer,
  holdSpeechAnchor,
  shouldShowSpeechDock,
  subscribeSpeechDock,
  type SpeechSession,
} from "./speech-dock";

/**
 * Сервисная кнопка озвучки держит якорь, пока смонтирована. С `ref` ещё и
 * следит, на экране ли она: пост с включённым чтением уехал за край ленты —
 * управлять им можно из дока.
 */
export function useSpeechAnchor(
  source: string,
  id: string | null,
  ref?: RefObject<Element | null>,
): void {
  const handle = useRef<ReturnType<typeof holdSpeechAnchor> | null>(null);
  const watched = useRef<{
    element: Element;
    observer: IntersectionObserver;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    const anchor = holdSpeechAnchor(source, id);
    handle.current = anchor;
    // Новый якорь у той же кнопки: наблюдатель отвечает на `observe` сразу
    // и сообщит, видна ли она.
    const current = watched.current;
    if (current) {
      current.observer.unobserve(current.element);
      current.observer.observe(current.element);
    }
    return () => {
      handle.current = null;
      anchor.release();
    };
  }, [source, id]);

  // Кнопка появляется не сразу (после гидрации, после загрузки поста), а
  // элемент в `ref` меняется без рендера хука, — сверяем на каждом рендере.
  useEffect(() => {
    const element = ref?.current ?? null;
    if (watched.current?.element === element) return;
    watched.current?.observer.disconnect();
    watched.current = null;
    handle.current?.setVisible(true);
    if (!element || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) handle.current?.setVisible(entry.isIntersecting);
    });
    observer.observe(element);
    watched.current = { element, observer };
  });

  useEffect(
    () => () => {
      watched.current?.observer.disconnect();
      watched.current = null;
    },
    [],
  );
}

/** Док: текущее чтение, если его пора показать, иначе `null`. */
export function useDockedSpeech(): SpeechSession | null {
  const current = useSyncExternalStore(
    subscribeSpeechDock,
    getSpeechSession,
    getSpeechSessionServer,
  );
  const show = useSyncExternalStore(
    subscribeSpeechDock,
    shouldShowSpeechDock,
    () => false,
  );
  return show ? current : null;
}
