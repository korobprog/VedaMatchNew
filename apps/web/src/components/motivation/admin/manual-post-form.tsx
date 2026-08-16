"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type {
  MotivationAudienceTrack,
  MotivationCategoryDto,
  MotivationLanguage,
  MotivationProfileType,
  MotivationVisualStyle,
} from "@vedamatch/shared";
import { apiRequest } from "../motivation-admin-api";
import { CollapsibleBlock } from "../collapsible-block";
import { detectLanguage } from "../manual-quote-form";
import { CategorySelect } from "./category-select";
import { PipelineStages } from "./pipeline-stages";
import { visualStyles } from "./review-actions";
import {
  cardClass,
  fieldClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "./ui";

const profiles: ReadonlyArray<{ value: MotivationProfileType; label: string }> = [
  { value: "user", label: "Ищущий" },
  { value: "in_goodness", label: "В благости" },
  { value: "yogi", label: "Йог" },
  { value: "devotee", label: "Преданный" },
];

const tracks: ReadonlyArray<{ value: MotivationAudienceTrack; label: string }> = [
  { value: "universal", label: "Мудрость мира" },
  { value: "vaishnava", label: "Вайшнавская мудрость" },
];

const extraLanguages: ReadonlyArray<{ value: MotivationLanguage; label: string }> = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
];

const emptyCopy = { title: "", explanation: "", storyText: "" };

const emptyForm = {
  originalText: "",
  originalLanguage: "ru" as MotivationLanguage,
  author: "",
  work: "",
  locator: "",
  sourceUrl: "",
  contextExcerpt: "",
  contentDate: "",
  ...emptyCopy,
};

export function ManualPostForm({
  categories,
}: {
  categories: MotivationCategoryDto[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [languageTouched, setLanguageTouched] = useState(false);
  const [selected, setSelected] = useState<MotivationProfileType[]>(["user"]);
  const [track, setTrack] = useState<MotivationAudienceTrack>("universal");
  const [style, setStyle] = useState<MotivationVisualStyle>("spiritual_watercolor");
  const [category, setCategory] = useState(
    categories.find((item) => item.isDefault)?.slug ?? categories[0]?.slug ?? "",
  );
  const [translations, setTranslations] = useState<
    Record<string, typeof emptyCopy>
  >({ en: { ...emptyCopy }, hi: { ...emptyCopy } });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  const ready =
    form.originalText.trim() &&
    form.author.trim() &&
    form.title.trim() &&
    form.explanation.trim() &&
    selected.length > 0;

  function update(field: keyof typeof form) {
    return (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function updateQuote(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const originalText = event.target.value;
    setForm((current) => ({
      ...current,
      originalText,
      ...(languageTouched
        ? {}
        : { originalLanguage: detectLanguage(originalText) as MotivationLanguage }),
    }));
  }

  function toggleProfile(profile: MotivationProfileType) {
    setSelected((current) =>
      current.includes(profile)
        ? current.filter((item) => item !== profile)
        : [...current, profile],
    );
  }

  async function submit() {
    setPending(true);
    setError(undefined);
    setDone(false);
    try {
      const extras = Object.fromEntries(
        extraLanguages
          .map(({ value }) => [value, translations[value]] as const)
          .filter(([, copy]) => copy.title.trim() && copy.explanation.trim()),
      );
      await apiRequest("/admin/motivation/manual-posts", "POST", {
        originalText: form.originalText.trim(),
        originalLanguage: form.originalLanguage,
        author: form.author.trim(),
        work: form.work.trim() || undefined,
        locator: form.locator.trim() || undefined,
        sourceUrl: form.sourceUrl.trim() || undefined,
        contextExcerpt: form.contextExcerpt.trim() || undefined,
        contentDate: form.contentDate || undefined,
        category: category || undefined,
        copy: {
          title: form.title.trim(),
          explanation: form.explanation.trim(),
          storyText: form.storyText.trim() || undefined,
        },
        ...(Object.keys(extras).length ? { translations: extras } : {}),
        profileTypes: selected,
        audienceTrack: track,
        visualStyle: style,
      });
      setForm(emptyForm);
      setTranslations({ en: { ...emptyCopy }, hi: { ...emptyCopy } });
      setLanguageTouched(false);
      setDone(true);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось создать мотивацию",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <div className={cardClass}>
        {done && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-cyan/40 bg-cyan/10 p-4"
          >
            <p className="flex items-center gap-2 font-medium text-text-0">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-cyan" />
              Мотивация создана, текст одобрен
            </p>
            <PipelineStages status="image_queued" className="mt-3" />
            <Link href="/admin/motivation/queue" className={`${secondaryButton} mt-3`}>
              Открыть очередь
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        <section>
          <h2 className="text-lg font-semibold text-text-0">1. Цитата</h2>
          <div className="mt-3 space-y-4">
            <label className={labelClass}>
              <span>Текст цитаты</span>
              <textarea
                aria-label="Текст цитаты"
                value={form.originalText}
                onChange={updateQuote}
                rows={3}
                placeholder="Дословно, без правок"
                className={`mt-2 ${fieldClass}`}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                <span>Автор</span>
                <input
                  type="text"
                  aria-label="Автор"
                  value={form.author}
                  onChange={update("author")}
                  className={`mt-2 ${fieldClass}`}
                />
              </label>
              <label className={labelClass}>
                <span>Язык оригинала</span>
                <select
                  aria-label="Язык оригинала"
                  value={form.originalLanguage}
                  onChange={(event) => {
                    setLanguageTouched(true);
                    update("originalLanguage")(event);
                  }}
                  className={`mt-2 ${fieldClass}`}
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                  <option value="hi">हिन्दी</option>
                </select>
              </label>
            </div>
            <CollapsibleBlock title="Уточнить источник (необязательно)" tone="framed">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  <span>Произведение</span>
                  <input
                    type="text"
                    aria-label="Произведение"
                    value={form.work}
                    onChange={update("work")}
                    className={`mt-2 ${fieldClass}`}
                  />
                </label>
                <label className={labelClass}>
                  <span>Глава/стих</span>
                  <input
                    type="text"
                    aria-label="Глава/стих"
                    value={form.locator}
                    onChange={update("locator")}
                    className={`mt-2 ${fieldClass}`}
                  />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  <span>Ссылка на источник</span>
                  <input
                    type="url"
                    aria-label="Ссылка на источник"
                    value={form.sourceUrl}
                    onChange={update("sourceUrl")}
                    placeholder="https://..."
                    className={`mt-2 ${fieldClass}`}
                  />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  <span>Контекст</span>
                  <textarea
                    aria-label="Контекст"
                    value={form.contextExcerpt}
                    onChange={update("contextExcerpt")}
                    rows={2}
                    className={`mt-2 ${fieldClass}`}
                  />
                </label>
              </div>
            </CollapsibleBlock>
          </div>
        </section>

        <section className="mt-6 border-t border-glass-brd pt-6">
          <h2 className="text-lg font-semibold text-text-0">2. Ваш текст</h2>
          <p className="mt-1 text-sm text-text-2">
            Нейросеть здесь не участвует — что напишете, то и увидят читатели.
          </p>
          <div className="mt-3 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                <span>Заголовок</span>
                <input
                  type="text"
                  aria-label="Заголовок"
                  value={form.title}
                  onChange={update("title")}
                  className={`mt-2 ${fieldClass}`}
                />
              </label>
              {/* Категория стоит рядом с заголовком, а не в «Кому и когда»:
                  внизу формы её не было видно без прокрутки. */}
              <CategorySelect
                categories={categories}
                value={category}
                disabled={pending}
                onChange={setCategory}
              />
            </div>
            <label className={labelClass}>
              <span>Пояснение</span>
              <textarea
                aria-label="Пояснение"
                value={form.explanation}
                onChange={update("explanation")}
                rows={5}
                placeholder="Почему эта цитата важна и как её применить"
                className={`mt-2 ${fieldClass}`}
              />
            </label>
            <label className={labelClass}>
              <span>Текст для Stories (необязательно)</span>
              <textarea
                aria-label="Текст для Stories"
                value={form.storyText}
                onChange={update("storyText")}
                rows={2}
                className={`mt-2 ${fieldClass}`}
              />
              <span className="mt-1 block text-xs font-normal text-text-2">
                Если пусто — возьмём пояснение.
              </span>
            </label>
            <CollapsibleBlock title="Другие языки (необязательно)" tone="framed">
              <p className="mb-3 text-xs text-text-2">
                Незаполненный язык получит русский текст — иначе у читателя с этим
                языком карточка была бы пустой.
              </p>
              <div className="space-y-4">
                {extraLanguages.map(({ value, label }) => (
                  <div key={value} className="space-y-2">
                    <p className="text-sm font-semibold text-text-1">{label}</p>
                    <input
                      type="text"
                      aria-label={`Заголовок · ${label}`}
                      value={translations[value].title}
                      placeholder="Заголовок"
                      onChange={(event) =>
                        setTranslations((current) => ({
                          ...current,
                          [value]: { ...current[value], title: event.target.value },
                        }))
                      }
                      className={fieldClass}
                    />
                    <textarea
                      aria-label={`Пояснение · ${label}`}
                      value={translations[value].explanation}
                      placeholder="Пояснение"
                      rows={3}
                      onChange={(event) =>
                        setTranslations((current) => ({
                          ...current,
                          [value]: {
                            ...current[value],
                            explanation: event.target.value,
                          },
                        }))
                      }
                      className={fieldClass}
                    />
                  </div>
                ))}
              </div>
            </CollapsibleBlock>
          </div>
        </section>

        <section className="mt-6 border-t border-glass-brd pt-6">
          <h2 className="text-lg font-semibold text-text-0">3. Кому и когда</h2>
          <div className="mt-3 space-y-4">
            <fieldset>
              <legend className={labelClass}>Аудитория</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {profiles.map((profile) => {
                  const active = selected.includes(profile.value);
                  return (
                    <label
                      key={profile.value}
                      className={[
                        "cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "border-cyan/40 bg-cyan/10 text-cyan"
                          : "border-glass-brd text-text-2 hover:text-text-0",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={active}
                        onChange={() => toggleProfile(profile.value)}
                      />
                      {profile.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                <span>Направление</span>
                <select
                  aria-label="Направление"
                  value={track}
                  onChange={(event) =>
                    setTrack(event.target.value as MotivationAudienceTrack)
                  }
                  className={`mt-2 ${fieldClass}`}
                >
                  {tracks.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                <span>Дата публикации</span>
                <input
                  type="date"
                  aria-label="Дата публикации"
                  value={form.contentDate}
                  onChange={update("contentDate")}
                  className={`mt-2 ${fieldClass}`}
                />
              </label>
              <label className={labelClass}>
                <span>Стиль изображения</span>
                <select
                  aria-label="Стиль изображения"
                  value={style}
                  onChange={(event) =>
                    setStyle(event.target.value as MotivationVisualStyle)
                  }
                  className={`mt-2 ${fieldClass}`}
                >
                  {visualStyles.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>

        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-red-500">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={pending || !ready}
          onClick={submit}
          className={`${primaryButton} mt-6`}
        >
          {pending ? "Создание…" : "Создать и отправить на изображение"}
        </button>
        <p className="mt-2 text-xs text-text-2">
          Текст уйдёт одобренным — проверять его повторно не придётся. Изображение
          создаст нейросеть, и оно всё равно потребует вашего подтверждения.
        </p>
      </div>

      <aside className={`${cardClass} lg:sticky lg:top-4`} aria-label="Предпросмотр">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-2">
          Как увидит читатель
        </p>
        <div className="mt-3 flex aspect-[4/3] items-center justify-center rounded-xl bg-bg-1 text-sm text-text-2">
          Здесь будет изображение
        </div>
        <h3 className="mt-4 text-xl font-bold text-text-0">
          {form.title || "Заголовок"}
        </h3>
        <p className="mt-3 whitespace-pre-line leading-7 text-text-1">
          {form.originalText || "Текст цитаты"}
        </p>
        {form.explanation && (
          <div className="mt-3">
            <CollapsibleBlock title="Пояснение">
              <p className="whitespace-pre-line leading-7 text-text-1">
                {form.explanation}
              </p>
            </CollapsibleBlock>
          </div>
        )}
        {form.author && (
          <p className="mt-4 border-l-2 border-gold pl-3 text-sm text-text-2">
            {[form.author, form.work, form.locator]
              .map((part) => part.trim())
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </aside>
    </div>
  );
}
