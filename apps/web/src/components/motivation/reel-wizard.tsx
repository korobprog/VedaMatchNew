"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  DonationSettingsDto,
  MotivationAudienceTrack,
  MotivationReelCreateInput,
  MotivationReelCreateResult,
  MotivationReelDto,
  MotivationReelBookDto,
  MotivationReelQuotaDto,
  MotivationReelSourceHit,
  MotivationReelTrackDto,
  MotivationReelVideoOptions,
  MotivationVoice,
  MotivationVoiceOptionDto,
  MotivationVisualStyle,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { DonateButton } from "@/components/donate-sheet";
import { splitQuoteAndExplanation } from "./quote-text";
import {
  MAX_TEXT,
  MIN_TEXT,
  POLL_INTERVAL_MS,
  quotaExhausted,
  quotaLine,
  shouldPoll,
  stageItems,
  STYLE_OPTIONS,
  type StageState,
} from "./reel-wizard-copy";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const MOTION_CHOICES = [
  { value: "calm", label: "Спокойное дыхание" },
  { value: "nature", label: "Ветер и свет" },
  { value: "zoom", label: "Медленный наезд" },
] as const;

export interface ReelWizardPrefill {
  /** Фрагмент, выделенный в читалке: книга, глава и текст. */
  book?: string;
  chapter?: string;
  text?: string;
  /** Открыть сразу экран статуса уже созданного рилса. */
  reelId?: string;
}

type Step = "quote" | "style" | "status";

/**
 * Мастер «Свой рилс»: цитата → формат и стиль → статус. Дальше конвейер
 * работает сам, а экран статуса опрашивает сервер и показывает стадии;
 * отказ — с причиной и одним обращением к администратору.
 */
export function ReelWizard({
  prefill,
  donation,
  defaultTrack = "universal",
}: {
  prefill: ReelWizardPrefill;
  donation: DonationSettingsDto | null;
  defaultTrack?: MotivationAudienceTrack;
}) {
  const fromBook = Boolean(prefill.book && prefill.chapter && prefill.text);
  const [step, setStep] = useState<Step>(prefill.reelId ? "status" : "quote");
  const [sourceKind, setSourceKind] = useState<"own" | "vedabase">(fromBook ? "vedabase" : "own");
  // Фрагмент из книг: пришёл из читалки или выбран поиском прямо здесь.
  const [book, setBook] = useState<MotivationReelSourceHit | null>(
    fromBook
      ? {
          text: prefill.text!,
          bookSlug: prefill.book!,
          bookTitle: prefill.book!,
          chapterSlug: prefill.chapter!,
          locator: "",
        }
      : null,
  );
  const [text, setText] = useState(prefill.text ?? "");
  const [author, setAuthor] = useState("");
  const [explanation, setExplanation] = useState("");
  const [track, setTrack] = useState<MotivationAudienceTrack>(defaultTrack);
  const [style, setStyle] = useState<MotivationVisualStyle | "">("");
  const [imageMode, setImageMode] = useState<"generate" | "upload">("generate");
  const [file, setFile] = useState<File | null>(null);
  const [quota, setQuota] = useState<MotivationReelQuotaDto | null>(null);
  const [reel, setReel] = useState<MotivationReelDto | null>(null);
  const [reelId, setReelId] = useState<string | null>(prefill.reelId ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_URL}/motivation/reels/quota`, { credentials: "include" })
      .then(async (response) => (response.ok ? ((await response.json()) as MotivationReelQuotaDto) : null))
      .then((value) => {
        if (!cancelled) setQuota(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const loadReel = useCallback(async (id: string) => {
    const response = await apiFetch(`${API_URL}/motivation/reels/${id}`, { credentials: "include" });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as MotivationReelDto;
  }, []);

  // Опрос статуса, пока конвейер работает. Таймер, а не интервал: следующий
  // запрос уходит только после ответа на предыдущий.
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (step !== "status" || !reelId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await loadReel(reelId);
        if (cancelled) return;
        setReel(next);
        // Пока идёт сборка ролика, статус тоже опрашиваем: иначе готовое
        // видео появится только после перезагрузки страницы.
        const busyVideo = next.videoState === "queued" || next.videoState === "running";
        if (shouldPoll(next.stage) || busyVideo)
          pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled) setError("Не удалось получить статус рилса");
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [step, reelId, loadReel]);

  const trimmed = text.trim();
  const textError =
    trimmed.length > 0 && trimmed.length < MIN_TEXT
      ? `Хотя бы ${MIN_TEXT} символов`
      : trimmed.length > MAX_TEXT
        ? `Не больше ${MAX_TEXT} символов — иначе не ляжет на кадр`
        : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const body: MotivationReelCreateInput = {
      source:
        sourceKind === "vedabase" && book
          ? {
              kind: "vedabase",
              text: trimmed,
              bookSlug: book.bookSlug,
              chapterSlug: book.chapterSlug,
            }
          : { kind: "own", text: trimmed, author: author.trim() || null },
      language: "ru",
      audienceTrack: track,
      visualStyle: style || null,
      explanation: explanation.trim() || null,
    };
    try {
      const response = await apiFetch(`${API_URL}/motivation/reels`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as MotivationReelCreateResult;
      // Свой кадр грузим сразу после создания: пост уже есть, и картинка
      // ложится в него вместо сгенерированной.
      if (imageMode === "upload" && file) {
        const form = new FormData();
        form.append("file", file);
        const upload = await apiFetch(`${API_URL}/motivation/reels/${result.id}/image`, {
          method: "POST",
          credentials: "include",
          body: form,
        });
        if (!upload.ok) throw new Error(await readError(upload));
      }
      setReelId(result.id);
      setStep("status");
      setQuota((current) =>
        current && !current.unlimited
          ? { ...current, used: current.used + 1, remaining: Math.max(0, current.remaining - 1) }
          : current,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать рилс");
    } finally {
      setPending(false);
    }
  }

  function restart() {
    // «Исправить»: текст остаётся, статус сбрасывается — человек правит и шлёт заново.
    setReel(null);
    setReelId(null);
    setError(null);
    setStep("quote");
  }

  const exhausted = quotaExhausted(quota);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-xs uppercase tracking-wide text-text-2">
          {step === "quote" && "Шаг 1 из 3 · Цитата"}
          {step === "style" && "Шаг 2 из 3 · Формат и стиль"}
          {step === "status" && "Шаг 3 из 3 · Сборка"}
        </div>
        {quota && <div className="text-xs text-text-2">{quotaLine(quota)}</div>}
      </header>
      <StepBar step={step} />

      {error && (
        <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {step !== "status" && exhausted && (
        <div className="glass rounded-2xl p-4 text-sm text-text-1">
          <p className="font-semibold text-text-0">
            {quota && !quota.enabled ? "Создание своих рилсов сейчас выключено" : "Сегодня рилс уже создан"}
          </p>
          <p className="mt-1">
            {quota && !quota.enabled
              ? "Загляните позже — мы сообщим, когда снова откроем."
              : "Следующий можно создать завтра. В бете генерация бесплатна и оплачивается из бюджета проекта."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/motivation/my" className="btn-mint-outline rounded-xl px-3 py-1.5 text-sm font-medium">
              Студия
            </Link>
            <DonateButton donation={donation} />
          </div>
        </div>
      )}

      {step === "quote" && !exhausted && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!textError && trimmed) setStep("style");
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <ChoiceCard
              active={sourceKind === "own"}
              onClick={() => setSourceKind("own")}
              title="✍ Написать самому"
              hint="своя мысль или цитата"
            />
            <ChoiceCard
              active={sourceKind === "vedabase"}
              onClick={() => setSourceKind("vedabase")}
              title="📚 Взять из наших книг"
              hint={book ? "фрагмент выбран" : "оглавление или поиск по словам"}
            />
          </div>
          {sourceKind === "vedabase" && (
            <BookSource
              selected={book}
              onSelect={(hit) => {
                setBook(hit);
                setText(hit.text);
              }}
              onClear={() => {
                setBook(null);
                setText("");
              }}
            />
          )}
          <label className="block text-sm text-text-1">
            Текст цитаты
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              maxLength={MAX_TEXT + 50}
              placeholder="Ты имеешь право лишь на действие, но не на его плоды."
              className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-base text-text-0"
              aria-invalid={Boolean(textError)}
              aria-describedby="reel-text-hint"
            />
            <span id="reel-text-hint" className={`mt-1 block text-xs ${textError ? "text-red-600 dark:text-red-300" : "text-text-2"}`}>
              {textError ?? `${trimmed.length} / ${MAX_TEXT}`}
            </span>
          </label>
          {sourceKind === "own" && (
            <label className="block text-sm text-text-1">
              Автор (необязательно)
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                maxLength={80}
                placeholder="Кому принадлежат слова"
                className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
              />
            </label>
          )}
          <label className="block text-sm text-text-1">
            Ваша мысль под цитатой (необязательно)
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={3}
              maxLength={800}
              placeholder="Почему эти слова важны для вас"
              className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
            />
          </label>
          <p className="text-xs text-text-2">
            {sourceKind === "own"
              ? "Своя цитата не попадёт в общую ленту «Для вас» — только в «Мои» и по ссылке: у неё нет проверенного источника."
              : "Фрагмент сверяется с текстом главы. Сократить можно, переписать нельзя — иначе он перестанет быть цитатой."}
          </p>
          <button
            type="submit"
            disabled={!trimmed || Boolean(textError) || (sourceKind === "vedabase" && !book)}
            className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Дальше: формат и стиль
          </button>
        </form>
      )}

      {step === "style" && !exhausted && (
        <form className="space-y-4" onSubmit={submit}>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-text-1">Трек ленты</legend>
            <div className="grid grid-cols-2 gap-2">
              <ChoiceCard active={track === "universal"} onClick={() => setTrack("universal")} title="Мудрость мира" hint="универсальная духовная мудрость" />
              <ChoiceCard active={track === "vaishnava"} onClick={() => setTrack("vaishnava")} title="Вайшнавская мудрость" hint="бхакти, писания, ачарьи" />
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-text-1">Картинка</legend>
            <div className="grid grid-cols-2 gap-2">
              <ChoiceCard
                active={imageMode === "generate"}
                onClick={() => setImageMode("generate")}
                title="✨ Сгенерировать"
                hint="по смыслу цитаты"
              />
              <ChoiceCard
                active={imageMode === "upload"}
                onClick={() => setImageMode("upload")}
                title="🖼 Загрузить своё"
                hint="фото или рисунок"
              />
            </div>
          </fieldset>
          {imageMode === "upload" && (
            <div className="space-y-2">
              <label className="block text-sm text-text-1">
                Файл (JPEG, PNG или WebP)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
                />
              </label>
              <p className="text-xs text-text-2">
                Кадр обрежется под вертикальный формат 9:16, снизу ляжет цитата. Подтвердите, что права
                на снимок ваши: чужие фото и скриншоты модерация отклоняет.
              </p>
            </div>
          )}
          <label className={`block text-sm text-text-1 ${imageMode === "upload" ? "opacity-50" : ""}`}>
            Визуальный стиль
            <select
              value={style}
              disabled={imageMode === "upload"}
              onChange={(e) => setStyle(e.target.value as MotivationVisualStyle | "")}
              className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
            >
              <option value="">Подобрать автоматически по смыслу</option>
              {STYLE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="glass rounded-2xl p-3 text-xs text-text-1">
            Формат: <b className="text-text-0">фото</b>. Видео и открытки для своих рилсов появятся следующим шагом.
            {imageMode === "upload" && " Свой кадр всегда смотрит администратор перед публикацией."}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStep("quote")} className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1">
              ← Назад
            </button>
            <button
              type="submit"
              disabled={pending || (imageMode === "upload" && !file)}
              className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {pending ? "Отправляем…" : "Отправить на проверку"}
            </button>
          </div>
        </form>
      )}

      {step === "status" && (
        <ReelStatus reel={reel} donation={donation} onRestart={restart} onUpdate={setReel} />
      )}
    </div>
  );
}

/**
 * Выбор фрагмента из книг двумя путями: листать оглавление или искать по
 * словам. Поиск удобен, когда помнишь формулировку, оглавление — когда
 * помнишь, где стих стоит; человеку нужны оба.
 */
function BookSource({
  selected,
  onSelect,
  onClear,
}: {
  selected: MotivationReelSourceHit | null;
  onSelect: (hit: MotivationReelSourceHit) => void;
  onClear: () => void;
}) {
  const [mode, setMode] = useState<"browse" | "search">("browse");

  if (selected)
    return (
      <div className="rounded-xl border border-cyan/40 bg-cyan/10 px-3 py-2 text-sm text-text-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-text-0">{selected.bookTitle}</div>
            {selected.locator && <div className="font-mono text-xs text-text-2">{selected.locator}</div>}
          </div>
          <button type="button" onClick={onClear} className="text-xs text-text-2 underline-offset-4 hover:underline">
            Выбрать другой
          </button>
        </div>
        <p className="mt-1 text-xs text-text-2">Источник будет проверен по тексту главы.</p>
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="tablist" aria-label="Как выбрать фрагмент">
        {(
          [
            ["browse", "📖 По книгам"],
            ["search", "🔍 Поиск по словам"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
              mode === value
                ? "border-cyan bg-cyan/10 text-text-0"
                : "border-glass-brd text-text-2 hover:text-text-0"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "browse" ? <BookBrowser onSelect={onSelect} /> : <BookSearch onSelect={onSelect} />}
    </div>
  );
}

/** Оглавление: книга → глава → стих. */
function BookBrowser({ onSelect }: { onSelect: (hit: MotivationReelSourceHit) => void }) {
  const [books, setBooks] = useState<MotivationReelBookDto[] | null>(null);
  const [bookSlug, setBookSlug] = useState("");
  const [chapterSlug, setChapterSlug] = useState("");
  const [hits, setHits] = useState<MotivationReelSourceHit[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_URL}/motivation/reels/books`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return [];
        const value: unknown = await response.json();
        // Ответ приходит из сети: список, а не что-то похожее, ломал бы рендер.
        return Array.isArray(value) ? (value as MotivationReelBookDto[]) : [];
      })
      .then((value) => {
        if (!cancelled) setBooks(value);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить список книг");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const book = books?.find((item) => item.slug === bookSlug) ?? null;

  async function loadChapter(nextChapter: string) {
    setChapterSlug(nextChapter);
    setHits(null);
    if (!nextChapter) return;
    setPending(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${API_URL}/motivation/reels/books/${bookSlug}/chapters/${nextChapter}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(await readError(response));
      setHits((await response.json()) as MotivationReelSourceHit[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Глава не открылась");
    } finally {
      setPending(false);
    }
  }

  if (books === null && !error) return <p className="text-sm text-text-2">Загружаем книги…</p>;
  if (books?.length === 0)
    return (
      <p className="text-sm text-text-2">
        Книги ещё не загружены. Напишите свою цитату — рилс всё равно получится.
      </p>
    );

  return (
    <div className="space-y-2">
      <label className="block text-sm text-text-1">
        Книга
        <select
          value={bookSlug}
          onChange={(event) => {
            setBookSlug(event.target.value);
            setChapterSlug("");
            setHits(null);
          }}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
        >
          <option value="">Выберите книгу</option>
          {(books ?? []).map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      {book && (
        <label className="block text-sm text-text-1">
          Глава
          <select
            value={chapterSlug}
            onChange={(event) => void loadChapter(event.target.value)}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
          >
            <option value="">Выберите главу</option>
            {book.chapters.map((chapter) => (
              <option key={chapter.slug} value={chapter.slug}>
                {chapter.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {pending && <p className="text-sm text-text-2">Открываем главу…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-300">
          {error}
        </p>
      )}
      <HitList hits={hits} onSelect={onSelect} emptyText="В этой главе нет подходящих фрагментов." />
    </div>
  );
}

/** Поиск по словам — для тех, кто помнит формулировку. */
function BookSearch({ onSelect }: { onSelect: (hit: MotivationReelSourceHit) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MotivationReelSourceHit[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setPending(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${API_URL}/motivation/reels/sources?q=${encodeURIComponent(query.trim())}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(await readError(response));
      setHits((await response.json()) as MotivationReelSourceHit[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Поиск не удался");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter внутри мастера иначе отправил бы форму шага целиком.
            if (event.key === "Enter") {
              event.preventDefault();
              if (query.trim().length >= 3) void search();
            }
          }}
          placeholder="Слова из стиха: «право на действие»"
          aria-label="Поиск по книгам"
          className="flex-1 rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-base text-text-0"
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={pending || query.trim().length < 3}
          className="btn-mint-outline rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Ищем…" : "Найти"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-300">
          {error}
        </p>
      )}
      <HitList
        hits={hits}
        onSelect={onSelect}
        emptyText="Ничего не нашлось. Попробуйте другие слова или откройте книгу по оглавлению."
      />
    </div>
  );
}

function HitList({
  hits,
  onSelect,
  emptyText,
}: {
  hits: MotivationReelSourceHit[] | null;
  onSelect: (hit: MotivationReelSourceHit) => void;
  emptyText: string;
}) {
  if (hits === null) return null;
  if (hits.length === 0) return <p className="text-sm text-text-2">{emptyText}</p>;
  return (
    <ul className="max-h-72 space-y-2 overflow-y-auto">
      {hits.map((hit, index) => (
        <li key={`${hit.bookSlug}-${hit.chapterSlug}-${index}`}>
          <button
            type="button"
            onClick={() => onSelect(hit)}
            className="w-full rounded-xl border border-glass-brd bg-glass p-3 text-left hover:border-cyan/40"
          >
            <span className="block text-sm text-text-0">{hit.text}</span>
            <span className="mt-1 block text-xs text-text-2">
              {hit.bookTitle}
              {hit.locator ? ` · ${hit.locator}` : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function StepBar({ step }: { step: Step }) {
  const index = step === "quote" ? 0 : step === "style" ? 1 : 2;
  return (
    <div className="grid grid-cols-3 gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <i key={i} className={`h-1 rounded ${i < index ? "bg-cyan" : i === index ? "bg-magenta" : "bg-bg-2"}`} />
      ))}
    </div>
  );
}

function ChoiceCard({
  active,
  disabled,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-2xl border p-3 text-left text-sm transition disabled:opacity-50 ${
        active ? "border-cyan bg-cyan/10 text-text-0" : "border-glass-brd bg-glass text-text-1 hover:text-text-0"
      }`}
    >
      <span className="block font-semibold">{title}</span>
      <span className="mt-0.5 block text-xs text-text-2">{hint}</span>
    </button>
  );
}

function ReelStatus({
  reel,
  donation,
  onRestart,
  onUpdate,
}: {
  reel: MotivationReelDto | null;
  donation: DonationSettingsDto | null;
  onRestart: () => void;
  onUpdate: (reel: MotivationReelDto) => void;
}) {
  const [appeal, setAppeal] = useState("");
  const [sending, setSending] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);

  if (!reel) return <p className="text-sm text-text-2">Загружаем статус…</p>;
  const items = stageItems(reel.stage);
  const { quote } = splitQuoteAndExplanation(reel.post.text);

  async function sendAppeal(event: FormEvent) {
    event.preventDefault();
    if (!reel) return;
    setSending(true);
    setAppealError(null);
    try {
      const response = await apiFetch(`${API_URL}/motivation/reels/${reel.id}/appeal`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: appeal.trim() }),
      });
      if (!response.ok) throw new Error(await readError(response));
      onUpdate((await response.json()) as MotivationReelDto);
      setAppeal("");
    } catch (e) {
      setAppealError(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-2" aria-label="Стадии сборки">
        {items.map((item, index) => (
          <li key={item.key} className={`flex items-start gap-3 rounded-2xl border p-3 ${item.state === "failed" ? "border-magenta/50 bg-magenta/5" : "border-glass-brd bg-glass"}`}>
            <StageDot state={item.state} index={index + 1} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text-0">{item.title}</div>
              <div className="text-xs text-text-1">{item.hint}</div>
            </div>
          </li>
        ))}
      </ol>

      {reel.stage === "rejected" && (
        <div className="space-y-3 rounded-2xl border border-magenta/40 bg-magenta/5 p-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-gold">Почему</div>
            <p className="mt-1 text-sm text-text-0">{reel.reason ?? "Текст не подходит для ленты вдохновения."}</p>
            <p className="mt-1 text-xs text-text-2">Лимит дня не потрачен: можно исправить и отправить снова.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onRestart} className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold">
              Исправить и отправить снова
            </button>
          </div>
          {reel.canAppeal ? (
            <form onSubmit={sendAppeal} className="space-y-2">
              <label className="block text-sm text-text-1">
                Не согласны? Напишите администратору
                <textarea
                  value={appeal}
                  onChange={(e) => setAppeal(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
                />
              </label>
              {appealError && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{appealError}</p>}
              <button type="submit" disabled={sending || !appeal.trim()} className="btn-mint-outline rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50">
                {sending ? "Отправляем…" : "✉ Написать администратору"}
              </button>
            </form>
          ) : (
            <p className="text-xs text-text-2">Обращение отправлено — администратор видит это решение и может его отменить. Ответ придёт в уведомления.</p>
          )}
        </div>
      )}

      {(reel.stage === "published" || reel.stage === "image_review") && reel.post.imageUrl && (
        <div className="overflow-hidden rounded-3xl border border-glass-brd">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={reel.post.imageUrl} alt="" className="aspect-[4/5] w-full object-cover" />
          <div className="p-4">
            <p className="font-display text-base text-text-0">{quote}</p>
          </div>
        </div>
      )}

      {reel.videoState === "queued" || reel.videoState === "running" ? (
        <p className="rounded-xl border border-magenta/40 bg-magenta/5 px-3 py-2 text-sm text-text-1">
          Оживляем кадр — обычно пара минут. Можно закрыть страницу: ролик появится в «Моих рилсах».
        </p>
      ) : null}
      {reel.videoState === "ready" && reel.post.videoUrl && (
        <video
          src={reel.post.videoUrl}
          poster={reel.post.imageUrl || undefined}
          controls
          playsInline
          className="w-full rounded-2xl border border-glass-brd"
        />
      )}
      {reel.videoState === "review" && (
        <p className="rounded-xl border border-gold/40 bg-gold/5 px-3 py-2 text-sm text-text-1">
          Ролик готов и ждёт проверки администратора — после неё он появится в рилсе.
        </p>
      )}
      {/* Кадр ждёт провайдера — не молчим: мастер обещает «~1–2 минуты», и
          без объяснения ожидание выглядит зависанием. */}
      {reel.waitNotice && (
        <p className="rounded-xl border border-gold/40 bg-gold/5 px-3 py-2 text-sm text-text-1">
          {reel.waitNotice}
        </p>
      )}

      {/* Про деньги говорим отдельно и до «попробуйте ещё раз»: повтор тут
          не поможет, а просьба о поддержке уместна ровно в этот момент. */}
      {reel.fundingNotice ? (
        <div className="rounded-2xl border border-gold/40 bg-gold/5 p-4">
          <p className="font-display text-base text-text-0">Генерация приостановлена</p>
          <p className="mt-1 text-sm text-text-1">{reel.fundingNotice}</p>
          <div className="mt-3">
            <DonateButton donation={donation} label="Помочь оплатить генерацию" />
          </div>
        </div>
      ) : (
        reel.videoState === "failed" &&
        // Отказ по содержанию — не «не получилось»: повтор с тем же кадром
        // даст ровно то же и снова будет оплачен.
        (reel.videoRejectionNotice ? (
          <p className="text-sm text-text-1">{reel.videoRejectionNotice}</p>
        ) : (
          <p className="text-sm text-text-1">Ролик не получился — можно попробовать ещё раз.</p>
        ))
      )}

      <div className="flex flex-wrap items-center gap-2">
        {reel.canAnimate && <AnimateButton reel={reel} onUpdate={onUpdate} />}
        {reel.stage === "published" && (
          <>
            {/* В ленту, а не на публичную страницу: она для гостей и ссылок. */}
            <Link
              href={`/motivation?post=${reel.post.slug}`}
              className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Открыть рилс
            </Link>
            {reel.post.storyImageUrl && (
              <a href={reel.post.storyImageUrl} download className="btn-mint-outline rounded-xl px-4 py-2 text-sm font-medium">
                ⤓ Скачать для Stories
              </a>
            )}
          </>
        )}
        {/* Лента — главный выход отсюда: рилс сделан, смотреть его идут туда.
            Поэтому она крупнее и заметнее остальных ссылок. */}
        <Link href="/motivation" className="btn-mint rounded-xl px-6 py-3 text-base font-semibold">
          К ленте
        </Link>
        <Link href="/motivation/my" className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1">
          Студия
        </Link>
        <DonateButton donation={donation} />
      </div>
      {shouldPoll(reel.stage) && (
        <p className="text-xs text-text-2">
          Можно закрыть страницу: когда кадр будет готов, придёт уведомление — по
          нему вы вернётесь сюда и решите, что делать с картинкой. Рилс всё это
          время ждёт в «Студии».
        </p>
      )}
    </div>
  );
}

/**
 * Выбор одного значения облачками вместо выпадающего списка.
 *
 * Список на телефоне открывается системной шторкой и прячет остальные
 * настройки, а варианты тут короткие и их немного — видеть их все сразу важнее,
 * чем экономить строку. Разметка остаётся группой радиокнопок для скринридера:
 * `aria-pressed` на кнопке сообщает выбранное.
 */
function ChipGroup({
  legend,
  value,
  options,
  onChange,
  children,
}: {
  legend: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-sm text-text-1">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value || "none"}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              value === option.value
                ? "border-cyan bg-cyan/10 text-text-0"
                : "border-glass-brd text-text-1 hover:text-text-0"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {children}
    </fieldset>
  );
}

/**
 * «Оживить в видео»: сначала три простых выбора, потом сборка. Настроек
 * намеренно мало — голос, музыка и длина. Всё остальное (модель, промпт
 * движения, громкость подложки) решает сервис: человеку тут решать нечего.
 */
function AnimateButton({
  reel,
  onUpdate,
}: {
  reel: MotivationReelDto;
  onUpdate: (reel: MotivationReelDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState<MotivationVoice | "">("");
  const [voices, setVoices] = useState<MotivationVoiceOptionDto[]>([]);
  const [trackId, setTrackId] = useState("");
  const [seconds, setSeconds] = useState<"" | "5" | "10" | "15">("");
  const [motion, setMotion] = useState<"calm" | "nature" | "zoom">("calm");
  const [tracks, setTracks] = useState<MotivationReelTrackDto[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiFetch(`${API_URL}/motivation/reels/voices`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return [];
        const value: unknown = await response.json();
        return Array.isArray(value) ? (value as MotivationVoiceOptionDto[]) : [];
      })
      .then((value) => {
        if (cancelled) return;
        setVoices(value);
        // Предвыбранный голос задаёт редакция: человеку не надо решать,
        // с какого начать.
        const preset = value.find((item) => item.isDefault);
        if (preset) setVoice(preset.value);
      })
      .catch(() => undefined);
    apiFetch(`${API_URL}/motivation/reels/music`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return [];
        const value: unknown = await response.json();
        return Array.isArray(value) ? (value as MotivationReelTrackDto[]) : [];
      })
      .then((value) => {
        if (!cancelled) setTracks(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const sample = voices.find((item) => item.value === voice)?.sampleUrl ?? null;

  async function animate() {
    setPending(true);
    setError(null);
    const options: MotivationReelVideoOptions = {
      voice: voice || null,
      trackId: trackId || null,
      seconds: seconds ? Number(seconds) : null,
      motion,
    };
    try {
      const response = await apiFetch(`${API_URL}/motivation/reels/${reel.id}/animate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      if (!response.ok) throw new Error(await readError(response));
      onUpdate((await response.json()) as MotivationReelDto);
      setOpen(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не получилось");
    } finally {
      setPending(false);
    }
  }

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold"
      >
        🎬 Оживить в видео
      </button>
    );

  return (
    <div className="w-full space-y-3 rounded-2xl border border-glass-brd bg-glass p-4">
      <p className="font-semibold text-text-0">Ролик из этой картинки</p>

      <ChipGroup
        legend="Голос"
        value={voice}
        onChange={(next) => setVoice(next as MotivationVoice | "")}
        options={[
          { value: "", label: "Без озвучки" },
          ...voices.map((item) => ({ value: item.value as string, label: item.label })),
        ]}
      >
        {sample && (
          <button
            type="button"
            onClick={() => new Audio(sample).play().catch(() => undefined)}
            className="mt-2 text-xs text-cyan underline-offset-4 hover:underline"
          >
            ▶ Послушать голос
          </button>
        )}
      </ChipGroup>

      <ChipGroup
        legend="Музыка"
        value={trackId}
        onChange={setTrackId}
        options={[
          { value: "", label: "Без музыки" },
          ...tracks.map((track) => ({ value: track.id, label: track.title })),
        ]}
      >
        {tracks.length === 0 && (
          <span className="mt-2 block text-xs text-text-2">
            Библиотека музыки пока пуста — её наполняет редакция.
          </span>
        )}
      </ChipGroup>

      <ChipGroup
        legend="Движение в кадре"
        value={motion}
        onChange={(next) => setMotion(next as "calm" | "nature" | "zoom")}
        options={MOTION_CHOICES.map((item) => ({ value: item.value as string, label: item.label }))}
      />

      <ChipGroup
        legend="Длина"
        value={seconds}
        onChange={(next) => setSeconds(next as "" | "5" | "10" | "15")}
        options={[
          { value: "", label: "Как получится" },
          { value: "5", label: "5 секунд" },
          { value: "10", label: "10 секунд" },
          { value: "15", label: "15 секунд" },
        ]}
      />

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void animate()}
          disabled={pending}
          className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Отправляем…" : "Создать ролик"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1"
        >
          Отмена
        </button>
      </div>
      <p className="text-xs text-text-2">
        Сборка занимает пару минут, страницу можно закрыть. Готовый ролик посмотрит
        администратор — после этого он появится в рилсе.
      </p>
    </div>
  );
}

function StageDot({ state, index }: { state: StageState; index: number }) {
  const className =
    state === "done"
      ? "bg-cyan text-white"
      : state === "active"
        ? "bg-magenta text-white motion-safe:animate-pulse"
        : state === "waiting"
          // Заливкой не берём: `--vm-gold` тёмный в светлой теме и светлый в
          // тёмной, и текст на нём тонул бы то в одной, то в другой. Обводка с
          // прозрачным фоном — тот же приём, что у золотых бейджей админки.
          ? "border-2 border-gold bg-gold/15 text-gold"
          : state === "failed"
            ? "bg-magenta text-white"
            : "bg-bg-2 text-text-2";
  return (
    <span aria-hidden="true" className={`flex h-7 w-7 flex-none items-center justify-center rounded-full font-mono text-xs font-bold ${className}`}>
      {state === "done" ? "✓" : state === "failed" ? "!" : state === "waiting" ? "⏳" : index}
    </span>
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    return message || `Ошибка ${response.status}`;
  } catch {
    return `Ошибка ${response.status}`;
  }
}
