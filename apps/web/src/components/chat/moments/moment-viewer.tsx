"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  chatMomentBackground,
  type ChatMomentDto,
  type ChatMomentFeed,
} from "@vedamatch/shared";
import {
  deleteChatMoment,
  markChatMomentViewed,
  replyToChatMoment,
} from "@/lib/chat-moments-api";
import { ChatAvatar } from "../chat-avatar";
import { firstUnseenIndex, remainingLabel, slideMs } from "./moments";

/**
 * Полноэкранный просмотр моментов одного человека.
 *
 * Автопереход выключается при `prefers-reduced-motion`: самопроизвольная
 * смена содержимого — это и есть движение, от которого защищаются, и
 * замедлять здесь нечего. Вместо него — явная кнопка «дальше», которая в
 * этом режиме показана всегда.
 */
export function MomentViewer({ feed }: { feed: ChatMomentFeed }) {
  const router = useRouter();
  const [index, setIndex] = useState(() => firstUnseenIndex(feed.moments));
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reply, setReply] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Звук выключен по умолчанию: автозапуск со звуком браузеры запрещают, и
   * ролик просто не стартовал бы, пока полоска идёт. Включается кнопкой и
   * держится на всю ленту — переспрашивать на каждом слайде незачем.
   */
  const [muted, setMuted] = useState(true);

  const moments = feed.moments;
  /**
   * Кого уже отметили просмотренным. Ref, а не состояние: отметка ничего не
   * рисует, а setState прямо в эффекте гонит лишний круг перерисовки на
   * каждый слайд.
   */
  const marked = useRef(new Set<string>());

  const reduced = usePrefersReducedMotion();
  const moment = moments[index];

  const close = useCallback(() => router.push("/chat"), [router]);

  const next = useCallback(() => {
    setProgress(0);
    setReply("");
    setSent(false);
    // Переход и закрытие решаются здесь, а не внутри обновления состояния:
    // `router.push` из тела обновления — побочное действие в фазе отрисовки,
    // и React справедливо ругается на него в консоли.
    if (index + 1 < moments.length) setIndex(index + 1);
    else close();
  }, [close, index, moments.length]);

  const previous = useCallback(() => {
    setProgress(0);
    setSent(false);
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  // Просмотр отмечается сразу при показе: «сколько додержал» здесь не
  // считаем — счётчик отвечает на вопрос «кто видел», а не «кто дочитал».
  useEffect(() => {
    if (!moment || moment.mine || moment.viewedByMe) return;
    if (marked.current.has(moment.id)) return;
    marked.current.add(moment.id);
    void markChatMomentViewed(moment.id).catch(() => undefined);
  }, [moment]);

  useEffect(() => {
    if (!moment || paused || reduced) return;
    const total = slideMs(moment);
    const started = Date.now();
    const timer = setInterval(() => {
      const share = Math.min(1, (Date.now() - started) / total);
      setProgress(share);
      if (share >= 1) next();
    }, 50);
    return () => clearInterval(timer);
  }, [moment, next, paused, reduced]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") previous();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, next, previous]);

  if (!moment)
    return (
      <p className="p-10 text-center text-sm text-text-1">Моменты закончились.</p>
    );

  const background = chatMomentBackground(moment.background ?? 0);

  async function send() {
    const text = reply.trim();
    if (!text || !moment) return;
    try {
      await replyToChatMoment(moment.id, text);
      setReply("");
      setSent(true);
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не отправилось");
    }
  }

  async function remove() {
    if (!moment) return;
    await deleteChatMoment(moment.id).catch(() => undefined);
    close();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Моменты: ${feed.author.name}`}
      className="fixed inset-0 z-50 flex flex-col bg-bg-0"
    >
      <div className="flex gap-1 px-3 pt-3">
        {moments.map((item, position) => (
          <span
            key={item.id}
            className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25"
          >
            <span
              style={{
                width:
                  position < index
                    ? "100%"
                    : position === index
                      ? `${Math.round(progress * 100)}%`
                      : "0%",
              }}
              className="block h-full bg-text-0"
            />
          </span>
        ))}
      </div>

      <header className="flex items-center gap-2.5 px-4 py-3">
        <ChatAvatar
          kind="direct"
          user={feed.author}
          title={feed.author.name}
          size={36}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-text-0">
            {feed.author.name}
          </span>
          <span className="font-mono text-[11px] text-text-2">
            осталось {remainingLabel(moment.expiresAt)}
            {moment.mine ? ` · ${moment.viewsCount} просмотров` : ""}
          </span>
        </span>
        {moment.mine && (
          <button
            type="button"
            onClick={() => void remove()}
            className="rounded-xl border border-glass-brd px-2.5 py-1.5 text-xs text-text-1 hover:text-text-0"
          >
            Убрать
          </button>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="Закрыть"
          className="rounded-xl border border-glass-brd px-2.5 py-1.5 text-xs text-text-1 hover:text-text-0"
        >
          Закрыть
        </button>
      </header>

      <div
        className="relative flex-1 overflow-hidden"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        // Палец, ушедший за край экрана, обязан снимать удержание: иначе
        // момент остаётся на паузе навсегда, и это выглядит как зависание.
        onPointerCancel={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {moment.kind === "video" && moment.url ? (
          <video
            // key по идентификатору: без него React переиспользует тот же
            // элемент на соседнем слайде, и второй ролик открывается на
            // позиции, докуда досмотрели первый.
            key={moment.id}
            src={moment.url}
            poster={moment.previewUrl ?? undefined}
            // Со звуком автозапуск запрещён браузером — ролик просто не
            // стартовал бы, а полоска шла. Звук включают кнопкой ниже.
            muted={muted}
            autoPlay
            playsInline
            preload="auto"
            className="h-full w-full object-contain"
          />
        ) : moment.kind === "photo" && moment.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={moment.url}
            alt={moment.caption || ""}
            className="h-full w-full object-contain"
          />
        ) : (
          <div
            style={{
              background: `linear-gradient(160deg, ${background.from}, ${background.to})`,
              color: background.ink,
            }}
            className="flex h-full w-full items-center justify-center p-8"
          >
            {/* Не заголовок: декоративный текст не должен ломать порядок h1→h2→h3. */}
            <p className="max-w-lg text-center font-display text-2xl leading-8">
              {moment.caption}
            </p>
          </div>
        )}

        {moment.kind === "video" && (
          <button
            type="button"
            onClick={() => setMuted((current) => !current)}
            aria-pressed={!muted}
            className="absolute right-3 top-3 rounded-2xl border border-glass-brd bg-glass px-3 py-1.5 text-xs text-text-0"
          >
            {muted ? "Включить звук" : "Выключить звук"}
          </button>
        )}

        {(moment.kind === "photo" || moment.kind === "video") &&
          moment.caption && (
          // Подложка обязательна: контраст поверх произвольной фотографии
          // иначе не обещать.
            <p className="absolute inset-x-0 bottom-0 bg-black/55 p-4 text-center text-sm leading-5 text-white">
              {moment.caption}
            </p>
          )}

        <button
          type="button"
          onClick={previous}
          aria-label="Предыдущий момент"
          className="absolute inset-y-0 left-0 w-1/3 cursor-default"
        />
        <button
          type="button"
          onClick={next}
          aria-label="Следующий момент"
          className="absolute inset-y-0 right-0 w-1/3 cursor-default"
        />
      </div>

      <footer className="flex flex-col gap-2 p-3">
        {reduced && (
          <button
            type="button"
            onClick={next}
            className="h-10 rounded-2xl border border-glass-brd bg-glass text-sm font-semibold text-text-0"
          >
            Дальше
          </button>
        )}
        {!moment.mine && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="flex items-center gap-2"
          >
            <input
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              placeholder={sent ? "Ответ отправлен" : "Ответить сообщением"}
              aria-label="Ответить на момент"
              className="h-11 flex-1 rounded-2xl border border-glass-brd bg-glass px-3.5 text-sm text-text-0 outline-none placeholder:text-text-2"
            />
            <button
              type="submit"
              disabled={!reply.trim()}
              className="h-11 rounded-2xl border border-mint-edge bg-mint px-4 text-sm font-semibold text-on-mint disabled:opacity-50"
            >
              Отправить
            </button>
          </form>
        )}
        {error && <p className="text-xs text-magenta">{error}</p>}
      </footer>
    </div>
  );
}

/** Уважение к `prefers-reduced-motion`: подписка, а не разовое чтение. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  const query = useRef<MediaQueryList | null>(null);

  useEffect(() => {
    query.current = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.current.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.current.addEventListener("change", listener);
    return () => query.current?.removeEventListener("change", listener);
  }, []);

  return reduced;
}

export type { ChatMomentDto };
