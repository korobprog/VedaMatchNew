/**
 * Портальный «пульт» озвучки (VED-569): что сейчас читает голос браузера и
 * как его остановить с любой страницы.
 *
 * Озвучка у каждого сервиса своя (Блог-лента, Образование, Вдохновение), и
 * сервисы друг друга не импортируют. Этот модуль — портальный уровень между
 * ними: сервисный «диктор» сообщает сюда факт (читаю / на паузе / замолчал)
 * и вместе с ним отдаёт свои команды «пауза / продолжить / стоп». Плавающий
 * док (`components/speech/speech-dock.tsx`) читает отсюда состояние и зовёт
 * эти команды, не зная, чей диктор за ними стоит.
 *
 * `speechSynthesis` у браузера один на вкладку, поэтому и слот один: новое
 * чтение из любого сервиса вытесняет прежнее.
 *
 * Док виден, только когда кнопки, которой озвучку включили, нет на экране:
 * сервисная кнопка держит «якорь» (`useSpeechAnchor`), пока смонтирована и
 * видна. Ушли со страницы — якорь снят, и поверх портала всплывает док.
 */
import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

export type SpeechStatus = "speaking" | "paused";

export interface SpeechControls {
  pause(): void;
  resume(): void;
  stop(): void;
}

export interface SpeechSession {
  /** Кто читает: slug сервиса («blog», «library», «motivation»). */
  source: string;
  /** Что читает — id поста, материала, цитаты внутри сервиса. */
  id: string;
  /** Название сервиса для человека — «Блог-лента». */
  service: string;
  /** Коротко, что читается: начало текста. */
  title: string;
  status: SpeechStatus;
  controls: SpeechControls;
}

let session: SpeechSession | null = null;
let listeners: Array<() => void> = [];

interface Anchor {
  source: string;
  id: string;
  visible: boolean;
}
let anchors: Anchor[] = [];

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeSpeechDock(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

export function getSpeechSession(): SpeechSession | null {
  return session;
}

export function getSpeechSessionServer(): SpeechSession | null {
  return null;
}

/** Длина названия в доке: полоса узкая, дальше — многоточие. */
const TITLE_MAX = 60;

/** Начало текста для дока: первая фраза, не длиннее предела. */
export function speechTitle(text: string, max = TITLE_MAX): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentence = /^[^.!?…]+/.exec(clean)?.[0]?.trim() || clean;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Сервисный диктор: «читаю» или «на паузе». Снимок подменяется целиком,
 * даже если сервис тот же, — иначе `useSyncExternalStore` не заметит смены
 * статуса.
 */
export function reportSpeech(next: SpeechSession): void {
  session = { ...next };
  notify();
}

/**
 * Диктор замолчал. Снимает слот, только если он всё ещё его: отмена чужим
 * сервисом прилетает вдогонку и не должна прятать уже новое чтение.
 */
export function clearSpeech(source: string, id?: string): void {
  if (!session || session.source !== source) return;
  if (id !== undefined && session.id !== id) return;
  session = null;
  notify();
}

export function pauseDockSpeech(): void {
  session?.controls.pause();
}

export function resumeDockSpeech(): void {
  session?.controls.resume();
}

/** «Стоп» дока: речь молчит, док прячется — даже если диктор не ответил. */
export function stopDockSpeech(): void {
  const current = session;
  if (!current) return;
  current.controls.stop();
  clearSpeech(current.source, current.id);
}

/** Видна ли на экране кнопка, которой включили текущее чтение. */
export function isSpeechAnchored(): boolean {
  const current = session;
  if (!current) return false;
  return anchors.some(
    (anchor) =>
      anchor.visible &&
      anchor.source === current.source &&
      anchor.id === current.id,
  );
}

/** Показывать ли док: чтение идёт или на паузе, а его кнопки не видно. */
export function shouldShowSpeechDock(): boolean {
  return session !== null && !isSpeechAnchored();
}

/** Якорь кнопки; возвращает «снять» и «видимость». Для хука и тестов. */
export function holdSpeechAnchor(
  source: string,
  id: string,
): { release: () => void; setVisible: (visible: boolean) => void } {
  const anchor: Anchor = { source, id, visible: true };
  anchors = [...anchors, anchor];
  notify();
  return {
    release() {
      anchors = anchors.filter((item) => item !== anchor);
      notify();
    },
    setVisible(visible) {
      if (anchor.visible === visible) return;
      anchor.visible = visible;
      anchors = [...anchors];
      notify();
    },
  };
}

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
