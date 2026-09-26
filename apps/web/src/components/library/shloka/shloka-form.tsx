"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Plus, RotateCcw, Trash2, X } from "lucide-react";
import {
  LIBRARY_SHLOKA_LIMITS,
  type LibraryLocale,
  type LibraryShlokaDto,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import {
  draftError,
  draftFromShloka,
  draftKey,
  draftSignature,
  draftToRequest,
  emptyAcharya,
  emptyDraft,
  imagePlan,
  type AcharyaDraft,
  type ImageDraft,
  type ShlokaDraft,
} from "./shloka-draft";
import {
  autosaveKey,
  restoreDraft,
  serializeDraft,
} from "./shloka-autosave";
import { VERSE_FONT_FAMILY, verseFontVariables } from "./shloka-font";
import { shlokaHref } from "./shloka-mode";
import { shlokaErrorText, st } from "./shloka-text";

const API_URL = apiBase();
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const FIELD =
  "mt-1 block min-h-11 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-base text-text-0";

export type ShlokaFormTarget =
  | { kind: "create"; categoryId: string; sourceLabel: string }
  | { kind: "edit"; shloka: LibraryShlokaDto };

/**
 * Форма шлоки — одна на создание и правку (VED-386). Картинки копятся в
 * черновике и уходят после сохранения текста, см. `shloka-draft.ts`.
 */
export function ShlokaForm({
  locale,
  target,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  locale: LibraryLocale;
  target: ShlokaFormTarget;
  /** Правка: окно возвращается в чтение. Создание уводит на новую шлоку само. */
  onSaved?: (shloka: LibraryShlokaDto) => void;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const initial = useMemo(
    () =>
      target.kind === "edit"
        ? draftFromShloka(target.shloka)
        : // Источник не подставляется по разделу (VED-464): «Шлоки» в поле
          // приходилось стирать каждый раз. Человек пишет его сам.
          emptyDraft(""),
    [target],
  );
  const [draft, setDraft] = useState<ShlokaDraft>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const baseline = useMemo(() => draftSignature(initial), [initial]);
  const dirty = draftSignature(draft) !== baseline;
  const storageKey = autosaveKey(
    target.kind === "edit"
      ? { kind: "edit", shlokaId: target.shloka.id }
      : { kind: "create", categoryId: target.categoryId },
  );
  /* Черновик в браузере (VED-466): ушёл в другое окно и вернулся — поля на
     месте. Пока не прочитали сохранённое, писать нельзя: первый проход с
     пустой формой стёр бы его. */
  const [hydrated, setHydrated] = useState(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- хранилище есть только в браузере. */
    try {
      const next = restoreDraft(
        initial,
        window.localStorage.getItem(storageKey),
        Date.now(),
      );
      if (next && draftSignature(next) !== baseline) {
        setDraft(next);
        setRestored(true);
      }
    } catch {
      // Приватный режим: форма работает без черновика.
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initial, baseline, storageKey]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (dirty) {
        window.localStorage.setItem(storageKey, serializeDraft(draft, Date.now()));
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Хранилище недоступно или переполнено — черновик живёт до ухода.
    }
  }, [draft, dirty, hydrated, storageKey]);
  const forgetDraft = () => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Нечего стирать.
    }
  };

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const set = <K extends keyof ShlokaDraft>(key: K, value: ShlokaDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setAcharya = (index: number, next: AcharyaDraft) =>
    setDraft((current) => ({
      ...current,
      acharyas: current.acharyas.map((block, i) => (i === index ? next : block)),
    }));

  async function submit() {
    const localError = draftError(draft);
    if (localError) {
      setError(shlokaErrorText(locale, localError));
      return;
    }
    setError(null);
    setPending(true);
    try {
      const body = draftToRequest(draft);
      const response = await apiFetch(
        target.kind === "edit"
          ? `${API_URL}/library/shlokas/${encodeURIComponent(target.shloka.id)}`
          : `${API_URL}/library/shlokas`,
        {
          method: target.kind === "edit" ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            target.kind === "edit"
              ? body
              : {
                  ...body,
                  categoryId: target.categoryId,
                  contentLanguage: locale,
                },
          ),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: unknown;
        } | null;
        setError(shlokaErrorText(locale, payload?.message));
        return;
      }
      let saved = (await response.json()) as LibraryShlokaDto;

      const plan = imagePlan(
        draft,
        saved.acharyas.map((block) => block.id),
      );
      let imagesFailed = false;
      for (const upload of plan.uploads) {
        const form = new FormData();
        form.append("file", upload.file);
        if (upload.acharyaId) form.append("acharyaId", upload.acharyaId);
        const res = await apiFetch(
          `${API_URL}/library/shlokas/${encodeURIComponent(saved.id)}/images`,
          { method: "POST", credentials: "include", body: form },
        ).catch(() => null);
        if (!res?.ok) imagesFailed = true;
      }
      for (const imageId of plan.removals) {
        const res = await apiFetch(
          `${API_URL}/library/shlokas/${encodeURIComponent(saved.id)}/images/${encodeURIComponent(imageId)}`,
          { method: "DELETE", credentials: "include" },
        ).catch(() => null);
        if (!res?.ok) imagesFailed = true;
      }
      if (plan.uploads.length > 0 || plan.removals.length > 0) {
        const fresh = await apiFetch(
          `${API_URL}/library/shlokas/${encodeURIComponent(saved.id)}`,
          { credentials: "include" },
        ).catch(() => null);
        if (fresh?.ok) saved = (await fresh.json()) as LibraryShlokaDto;
      }
      if (imagesFailed) window.alert(st(locale, "form.imagesFailed"));

      forgetDraft();
      onDirtyChange?.(false);
      if (target.kind === "create") {
        router.push(shlokaHref(saved.id));
        return;
      }
      onSaved?.(saved);
    } catch {
      setError(st(locale, "error.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className={`${verseFontVariables} grid gap-5`}
    >
      {/* «Сохранить» и сверху (VED-466): нижняя кнопка — за длинной формой,
          до неё надо листать через все поля. */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {restored && (
          <p role="status" className="mr-auto flex flex-wrap items-center gap-2 text-sm text-text-1">
            {st(locale, "form.draftRestored")}
            <button
              type="button"
              onClick={() => {
                setDraft(initial);
                setRestored(false);
                forgetDraft();
              }}
              className="inline-flex min-h-9 items-center rounded-xl border border-glass-brd px-3 text-sm text-text-1 hover:text-text-0"
            >
              {st(locale, "form.draftDiscard")}
            </button>
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="btn-mint inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? st(locale, "form.saving") : st(locale, "form.save")}
        </button>
      </div>
      <TextField
        label={st(locale, "form.source")}
        hint={st(locale, "form.sourceHint")}
        value={draft.source}
        onChange={(value) => set("source", value)}
        required
        requiredLabel={st(locale, "form.required")}
        maxLength={300}
        placeholder={st(locale, "form.sourcePlaceholder")}
      />
      <TextField
        label={st(locale, "form.verse")}
        hint={st(locale, "form.verseHint")}
        value={draft.verse}
        onChange={(value) => set("verse", value)}
        maxLength={LIBRARY_SHLOKA_LIMITS.verse}
        inputMode="decimal"
        placeholder="2.13"
      />
      <AreaField
        label={st(locale, "form.text")}
        hint={st(locale, "form.textHint")}
        value={draft.text}
        onChange={(value) => set("text", value)}
        rows={6}
        maxLength={LIBRARY_SHLOKA_LIMITS.text}
        verse
      />
      <AreaField
        label={st(locale, "form.translation")}
        value={draft.translation}
        onChange={(value) => set("translation", value)}
        required
        requiredLabel={st(locale, "form.required")}
        rows={4}
        maxLength={LIBRARY_SHLOKA_LIMITS.translation}
      />
      <AreaField
        label={st(locale, "form.wordByWord")}
        value={draft.wordByWord}
        onChange={(value) => set("wordByWord", value)}
        rows={4}
        maxLength={LIBRARY_SHLOKA_LIMITS.wordByWord}
      />
      <AreaField
        label={st(locale, "form.commentary")}
        value={draft.commentary}
        onChange={(value) => set("commentary", value)}
        rows={8}
        maxLength={LIBRARY_SHLOKA_LIMITS.commentary}
      />
      <ImagesField
        locale={locale}
        images={draft.images}
        onChange={(images) => set("images", images)}
      />

      <fieldset className="grid gap-4 rounded-2xl border border-glass-brd p-4">
        <legend className="px-1 font-display text-sm font-semibold uppercase tracking-wide text-text-0">
          {st(locale, "form.acharyas")}
        </legend>
        <p className="text-sm text-text-1">{st(locale, "form.acharyasHint")}</p>
        {draft.acharyas.map((block, index) => (
          <AcharyaFields
            key={block.key}
            locale={locale}
            index={index}
            block={block}
            onChange={(next) => setAcharya(index, next)}
            onRemove={() =>
              set(
                "acharyas",
                draft.acharyas.filter((_, i) => i !== index),
              )
            }
          />
        ))}
        {draft.acharyas.length < LIBRARY_SHLOKA_LIMITS.acharyas && (
          <button
            type="button"
            onClick={() => set("acharyas", [...draft.acharyas, emptyAcharya()])}
            className="inline-flex min-h-11 items-center justify-center gap-2 justify-self-start rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-1 hover:text-text-0"
          >
            <Plus aria-hidden className="h-4 w-4" />
            {st(locale, "form.acharyaAdd")}
          </button>
        )}
      </fieldset>

      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-xl border border-magenta/50 bg-bg-1 px-4 py-3 text-sm text-text-0"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="btn-mint inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-semibold disabled:opacity-60"
        >
          {pending
            ? st(locale, "form.saving")
            : st(locale, "form.save")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={() => {
              forgetDraft();
              onCancel();
            }}
            disabled={pending}
            className="inline-flex min-h-11 items-center rounded-xl border border-glass-brd px-5 text-sm text-text-1 hover:text-text-0"
          >
            {st(locale, "form.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}

function Label({
  label,
  required,
  requiredLabel,
}: {
  label: string;
  required?: boolean;
  requiredLabel?: string;
}) {
  return (
    <span className="text-sm font-semibold text-text-1">
      {label}
      {required && (
        <span className="font-normal text-text-1"> ({requiredLabel})</span>
      )}
    </span>
  );
}

function TextField({
  label,
  hint,
  value,
  onChange,
  required,
  requiredLabel,
  maxLength,
  inputMode,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  requiredLabel?: string;
  maxLength?: number;
  inputMode?: "decimal" | "text";
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id}>
        <Label label={label} required={required} requiredLabel={requiredLabel} />
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        aria-required={required}
        maxLength={maxLength}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={FIELD}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-text-1">
          {hint}
        </p>
      )}
    </div>
  );
}

function AreaField({
  label,
  hint,
  value,
  onChange,
  required,
  requiredLabel,
  rows,
  maxLength,
  verse = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  requiredLabel?: string;
  rows: number;
  maxLength?: number;
  /** Поле самого стиха — шрифтом для санскрита, как в окне шлоки. */
  verse?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id}>
        <Label label={label} required={required} requiredLabel={requiredLabel} />
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        aria-required={required}
        rows={rows}
        maxLength={maxLength}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={`${FIELD} leading-7`}
        style={verse ? { fontFamily: VERSE_FONT_FAMILY, fontSize: "1.1rem" } : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-text-1">
          {hint}
        </p>
      )}
    </div>
  );
}

function ImagesField({
  locale,
  images,
  onChange,
}: {
  locale: LibraryLocale;
  images: ImageDraft[];
  onChange: (images: ImageDraft[]) => void;
}) {
  const id = useId();
  return (
    <div>
      <p id={`${id}-label`}>
        <Label label={st(locale, "form.images")} />
      </p>
      <p id={`${id}-hint`} className="mb-2 mt-1 text-xs text-text-1">
        {st(locale, "form.imagesHint")}
      </p>
      {images.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((image, index) => {
            const src = image.kind === "new" ? image.previewUrl : image.url;
            const removed = image.kind === "existing" && image.removed;
            return (
              <li key={image.kind === "new" ? image.key : image.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- превью из blob: и своего S3 */}
                <img
                  src={src}
                  alt=""
                  className={`aspect-square w-full rounded-xl border border-glass-brd object-cover ${
                    removed ? "opacity-30" : ""
                  }`}
                />
                {image.kind === "new" && (
                  <span className="absolute inset-x-1 bottom-1 rounded-lg bg-bg-0/85 px-1 py-0.5 text-center text-[11px] text-text-0">
                    {st(locale, "form.imageNew")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (image.kind === "new") {
                      URL.revokeObjectURL(image.previewUrl);
                      onChange(images.filter((_, i) => i !== index));
                    } else {
                      onChange(
                        images.map((item, i) =>
                          i === index && item.kind === "existing"
                            ? { ...item, removed: !item.removed }
                            : item,
                        ),
                      );
                    }
                  }}
                  aria-label={`${st(
                    locale,
                    removed ? "form.imageRestore" : "form.imageRemove",
                  )} ${index + 1}`}
                  className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-bg-0/90 text-text-0 shadow"
                >
                  {removed ? (
                    <RotateCcw aria-hidden className="h-4 w-4" />
                  ) : (
                    <X aria-hidden className="h-4 w-4" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {/* Поле выбора файлов спрятано визуально, но остаётся в порядке
          табуляции: фокус на нём рисует обводку у подписи-кнопки. */}
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-1 hover:text-text-0 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-magenta">
        <ImagePlus aria-hidden className="h-4 w-4" />
        {st(locale, "form.imagesAdd")}
        <input
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          aria-describedby={`${id}-hint`}
          className="sr-only"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length === 0) return;
            onChange([
              ...images,
              ...files.map((file) => ({
                kind: "new" as const,
                key: draftKey("image"),
                file,
                previewUrl: URL.createObjectURL(file),
              })),
            ]);
          }}
        />
      </label>
    </div>
  );
}

function AcharyaFields({
  locale,
  index,
  block,
  onChange,
  onRemove,
}: {
  locale: LibraryLocale;
  index: number;
  block: AcharyaDraft;
  onChange: (next: AcharyaDraft) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof AcharyaDraft>(key: K, value: AcharyaDraft[K]) =>
    onChange({ ...block, [key]: value });
  const heading = `${st(locale, "form.acharyaBlock")} ${index + 1}${
    block.acharya.trim() ? ` — ${block.acharya.trim()}` : ""
  }`;
  return (
    <fieldset className="grid gap-4 rounded-2xl border border-glass-brd bg-bg-1/60 p-4">
      <legend className="px-1 text-sm font-semibold text-text-0">{heading}</legend>
      <TextField
        label={st(locale, "form.acharyaName")}
        value={block.acharya}
        onChange={(value) => set("acharya", value)}
        required
        requiredLabel={st(locale, "form.required")}
        maxLength={LIBRARY_SHLOKA_LIMITS.acharyaName}
      />
      <AreaField
        label={st(locale, "form.text")}
        value={block.text}
        onChange={(value) => set("text", value)}
        rows={4}
        maxLength={LIBRARY_SHLOKA_LIMITS.text}
        verse
      />
      <AreaField
        label={st(locale, "form.translation")}
        value={block.translation}
        onChange={(value) => set("translation", value)}
        rows={3}
        maxLength={LIBRARY_SHLOKA_LIMITS.translation}
      />
      <AreaField
        label={st(locale, "form.wordByWord")}
        value={block.wordByWord}
        onChange={(value) => set("wordByWord", value)}
        rows={3}
        maxLength={LIBRARY_SHLOKA_LIMITS.wordByWord}
      />
      <AreaField
        label={st(locale, "form.commentary")}
        value={block.commentary}
        onChange={(value) => set("commentary", value)}
        rows={5}
        maxLength={LIBRARY_SHLOKA_LIMITS.commentary}
      />
      <ImagesField
        locale={locale}
        images={block.images}
        onChange={(images) => set("images", images)}
      />
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-xl border border-glass-brd px-4 text-sm text-text-1 hover:text-text-0"
      >
        <Trash2 aria-hidden className="h-4 w-4" />
        {st(locale, "form.acharyaRemove")}
      </button>
    </fieldset>
  );
}
