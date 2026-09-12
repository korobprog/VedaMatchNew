"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type {
  CommunityBadgeDto,
  GeoSearchResult,
  VacancyAudience,
  VacancyEmployment,
  VacancyKind,
  VacancyOfferDto,
  VacancyPayPeriod,
  VacancyPerk,
  VacancySevaTerm,
  VacancyWorkFormat,
} from "@vedamatch/shared";
import { getMyCommunities } from "@/lib/communities-api";
import { apiFetch } from "@/lib/http-client";
import {
  VacanciesApiError,
  createVacancy,
  updateVacancy,
} from "@/lib/vacancies-api";
import {
  EMPTY_VACANCY_FORM,
  draftKey,
  fromOffer,
  toCreateRequest,
  validateVacancyForm,
  type VacancyFormState,
} from "./vacancy-form-rules";
import {
  VACANCY_AUDIENCE_LABELS,
  VACANCY_EMPLOYMENT_LABELS,
  VACANCY_KIND_HINTS,
  VACANCY_KIND_LABELS,
  VACANCY_KIND_ORDER,
  VACANCY_PAY_PERIOD_LABELS,
  VACANCY_PERK_LABELS,
  VACANCY_SEVA_TERM_LABELS,
  VACANCY_WORK_FORMAT_LABELS,
} from "./vacancy-labels";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

/** Роли, дающие право говорить от имени общины. */
const POSTING_ROLES = new Set(["owner", "admin"]);

const INPUT =
  "w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2";

/**
 * Форма предложения. Первый шаг — вид, он меняет набор полей. Черновик
 * нового предложения живёт в localStorage: длинный текст нельзя терять на
 * случайном обновлении вкладки.
 */
export function VacancyForm({ offer }: { offer?: VacancyOfferDto }) {
  const router = useRouter();
  const editing = Boolean(offer);
  const [form, setForm] = useState<VacancyFormState>(() =>
    offer ? fromOffer(offer) : EMPTY_VACANCY_FORM,
  );
  const [communities, setCommunities] = useState<CommunityBadgeDto[]>([]);
  const [locationQuery, setLocationQuery] = useState(
    offer?.city ?? "",
  );
  const [locationResults, setLocationResults] = useState<GeoSearchResult[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  const patch = (changes: Partial<VacancyFormState>) =>
    setForm((current) => ({ ...current, ...changes }));

  // Черновик восстанавливается один раз при открытии новой формы.
  useEffect(() => {
    if (editing) return;
    let alive = true;
    // Чтение localStorage — внешняя система; состояние обновляется из
    // колбэка, а не из тела эффекта, как требует правило хуков.
    queueMicrotask(() => {
      if (!alive) return;
      try {
        const raw = window.localStorage.getItem(draftKey(null));
        if (!raw) return;
        const parsed = JSON.parse(raw) as VacancyFormState;
        // Пустой черновик восстанавливать нечего — и незачем пугать плашкой.
        if (!parsed.title && !parsed.description) return;
        setForm({ ...EMPTY_VACANCY_FORM, ...parsed });
        if (parsed.location) setLocationQuery(parsed.location.city);
        setDraftRestored(true);
      } catch {
        // Испорченный черновик — не повод ломать форму.
      }
    });
    return () => {
      alive = false;
    };
  }, [editing]);

  useEffect(() => {
    if (editing) return;
    try {
      window.localStorage.setItem(draftKey(null), JSON.stringify(form));
    } catch {
      // Приватное окно — черновик просто не сохранится.
    }
  }, [editing, form]);

  useEffect(() => {
    let alive = true;
    getMyCommunities()
      .then((response) => {
        if (!alive) return;
        setCommunities(
          response.memberships.filter((badge) => POSTING_ROLES.has(badge.role)),
        );
      })
      .catch(() => {
        // Без общин форма работает — просто не будет выбора «от имени».
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const query = locationQuery.trim();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (query.length < 2 || query === form.location?.city) {
        setLocationResults([]);
        return;
      }
      apiFetch(`${API_URL}/geo/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(await res.text());
          setLocationResults((await res.json()) as GeoSearchResult[]);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setLocationResults([]);
        });
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [form.location?.city, locationQuery]);

  const problem = validateVacancyForm(form);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const request = toCreateRequest(form);
      const saved = offer
        ? await updateVacancy(offer.id, request)
        : await createVacancy(request);
      if (!offer) {
        try {
          window.localStorage.removeItem(draftKey(null));
        } catch {
          // Не критично.
        }
      }
      router.push(`/vacancies/${saved.id}`);
    } catch (e) {
      setError(
        e instanceof VacanciesApiError ? e.message : "Не удалось сохранить",
      );
      setPending(false);
    }
  };

  const clearDraft = () => {
    try {
      window.localStorage.removeItem(draftKey(null));
    } catch {
      // Не критично.
    }
    setForm(EMPTY_VACANCY_FORM);
    setLocationQuery("");
    setDraftRestored(false);
  };

  const sevaWithoutCommunity = form.kind === "seva" && communities.length === 0;

  return (
    <form
      onSubmit={submit}
      className="glass rounded-2xl border border-glass-brd p-6"
    >
      {draftRestored && (
        <p className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-glass-brd bg-glass px-4 py-3 text-sm text-text-1">
          Восстановили черновик.
          <button
            type="button"
            onClick={clearDraft}
            className="text-text-0 underline"
          >
            Начать заново
          </button>
        </p>
      )}

      <Field label="Что предлагаете">
        <div
          role="radiogroup"
          aria-label="Вид предложения"
          className="flex flex-wrap gap-2"
        >
          {VACANCY_KIND_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={form.kind === option}
              // При правке вид менять нельзя: у видов разные поля и сроки.
              disabled={editing && form.kind !== option}
              onClick={() => patch({ kind: option })}
              className={`rounded-full border px-3 py-1 text-sm transition disabled:opacity-40 ${
                form.kind === option
                  ? "border-magenta/40 bg-magenta/10 text-text-0"
                  : "border-glass-brd text-text-1 hover:text-text-0"
              }`}
            >
              {VACANCY_KIND_LABELS[option]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-text-2">
          {VACANCY_KIND_HINTS[form.kind]}
        </p>
      </Field>

      {sevaWithoutCommunity && (
        <p className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-text-1">
          Служение публикуется от имени общины, а вы пока не управляете ни
          одной. Нужна работа за оплату или разовая задача — выберите их;
          общину можно завести в{" "}
          <Link href="/communities" className="text-text-0 underline">
            разделе общин
          </Link>
          .
        </p>
      )}

      <Field label="Заголовок" htmlFor="vacancy-title">
        <input
          id="vacancy-title"
          required
          value={form.title}
          maxLength={140}
          onChange={(event) => patch({ title: event.target.value })}
          placeholder={
            form.kind === "work"
              ? "Повар в кафе при храме"
              : form.kind === "seva"
                ? "Помощь на кухне по воскресеньям"
                : "Перевезти книги на фестиваль"
          }
          className={INPUT}
        />
      </Field>

      <Field label="Подробности" htmlFor="vacancy-description">
        <textarea
          id="vacancy-description"
          rows={6}
          value={form.description}
          onChange={(event) => patch({ description: event.target.value })}
          placeholder="Что делать, что нужно уметь, как устроен день"
          className={INPUT}
        />
      </Field>

      {form.kind === "work" && (
        <>
          <Field label="Формат">
            <div className="flex flex-wrap gap-2">
              {(
                Object.entries(VACANCY_WORK_FORMAT_LABELS) as Array<
                  [VacancyWorkFormat, string]
                >
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={form.workFormat === value}
                  onClick={() => patch({ workFormat: value })}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    form.workFormat === value
                      ? "border-magenta/40 bg-magenta/10 text-text-0"
                      : "border-glass-brd text-text-1 hover:text-text-0"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Занятость" htmlFor="vacancy-employment">
            <select
              id="vacancy-employment"
              value={form.employment}
              onChange={(event) =>
                patch({ employment: event.target.value as VacancyEmployment | "" })
              }
              className={INPUT}
            >
              <option value="" className="bg-bg-0">
                Не важно
              </option>
              {(
                Object.entries(VACANCY_EMPLOYMENT_LABELS) as Array<
                  [VacancyEmployment, string]
                >
              ).map(([value, label]) => (
                <option key={value} value={value} className="bg-bg-0">
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="График" htmlFor="vacancy-schedule">
            <input
              id="vacancy-schedule"
              value={form.schedule}
              maxLength={200}
              onChange={(event) => patch({ schedule: event.target.value })}
              placeholder="5/2 с 9 до 18, или по договорённости"
              className={INPUT}
            />
          </Field>

          <Field label="Оплата">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                inputMode="numeric"
                value={form.payMin}
                disabled={form.payNegotiable}
                onChange={(event) => patch({ payMin: event.target.value })}
                placeholder="от"
                aria-label="Оплата от"
                className={`${INPUT} disabled:opacity-50`}
              />
              <input
                inputMode="numeric"
                value={form.payMax}
                disabled={form.payNegotiable}
                onChange={(event) => patch({ payMax: event.target.value })}
                placeholder="до"
                aria-label="Оплата до"
                className={`${INPUT} disabled:opacity-50`}
              />
              <select
                value={form.payPeriod}
                aria-label="За какой период"
                onChange={(event) =>
                  patch({ payPeriod: event.target.value as VacancyPayPeriod })
                }
                className={INPUT}
              >
                {(
                  Object.entries(VACANCY_PAY_PERIOD_LABELS) as Array<
                    [VacancyPayPeriod, string]
                  >
                ).map(([value, label]) => (
                  <option key={value} value={value} className="bg-bg-0">
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm text-text-1">
              <input
                type="checkbox"
                checked={form.payNegotiable}
                onChange={(event) =>
                  patch({ payNegotiable: event.target.checked })
                }
              />
              По договорённости
            </label>
            <p className="mt-1 text-xs text-text-2">
              Суммы в рублях. Честная вилка приводит тех, кому она подходит.
            </p>
          </Field>
        </>
      )}

      {form.kind === "seva" && (
        <>
          <Field label="Срок">
            <div className="flex flex-wrap gap-2">
              {(
                Object.entries(VACANCY_SEVA_TERM_LABELS) as Array<
                  [VacancySevaTerm, string]
                >
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={form.sevaTerm === value}
                  onClick={() => patch({ sevaTerm: value })}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    form.sevaTerm === value
                      ? "border-magenta/40 bg-magenta/10 text-text-0"
                      : "border-glass-brd text-text-1 hover:text-text-0"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {form.sevaTerm !== "ongoing" && (
              <input
                type="datetime-local"
                value={form.sevaUntil}
                aria-label="До какой даты"
                onChange={(event) => patch({ sevaUntil: event.target.value })}
                className={`${INPUT} mt-2`}
              />
            )}
          </Field>

          <Field label="Что предоставляете">
            <div className="flex flex-wrap gap-4 text-sm text-text-1">
              {(
                Object.entries(VACANCY_PERK_LABELS) as Array<
                  [VacancyPerk, string]
                >
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.perks.includes(value)}
                    onChange={(event) =>
                      patch({
                        perks: event.target.checked
                          ? [...form.perks, value]
                          : form.perks.filter((perk) => perk !== value),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>
        </>
      )}

      {form.kind === "task" && (
        <Field label="К какому сроку" htmlFor="vacancy-due">
          <input
            id="vacancy-due"
            type="datetime-local"
            value={form.dueAt}
            onChange={(event) => patch({ dueAt: event.target.value })}
            className={INPUT}
          />
          <p className="mt-1 text-xs text-text-2">
            Необязательно. С датой предложение живёт до неё, без даты — две
            недели.
          </p>
        </Field>
      )}

      <Field label="Город" htmlFor="vacancy-city">
        <input
          id="vacancy-city"
          value={locationQuery}
          onChange={(event) => {
            patch({ location: null });
            setLocationQuery(event.target.value);
          }}
          placeholder="Начните вводить город"
          className={INPUT}
        />
        {locationResults.length > 0 && (
          <ul className="mt-2 space-y-1">
            {locationResults.map((result) => (
              <li key={`${result.lat},${result.lon}`}>
                <button
                  type="button"
                  onClick={() => {
                    patch({ location: result });
                    setLocationQuery(result.city);
                    setLocationResults([]);
                  }}
                  className="w-full rounded-lg border border-glass-brd px-3 py-2 text-left text-sm text-text-1 hover:text-text-0"
                >
                  {result.displayName ?? result.city}
                </button>
              </li>
            ))}
          </ul>
        )}
        {form.kind !== "work" && (
          <label className="mt-2 flex items-center gap-2 text-sm text-text-1">
            <input
              type="checkbox"
              checked={form.isRemote}
              onChange={(event) => patch({ isRemote: event.target.checked })}
            />
            Место не важно, можно из любого города
          </label>
        )}
        <p className="mt-1 text-xs text-text-2">
          Ваш адрес не публикуется, только город.
        </p>
      </Field>

      {communities.length > 0 && (
        <Field label="От чьего имени" htmlFor="vacancy-community">
          <select
            id="vacancy-community"
            value={form.communityId}
            onChange={(event) => {
              const communityId = event.target.value;
              patch({
                communityId,
                audience:
                  !communityId && form.audience === "my_community"
                    ? "everyone"
                    : form.audience,
              });
            }}
            className={INPUT}
          >
            <option value="" className="bg-bg-0">
              От себя
            </option>
            {communities.map((badge) => (
              <option key={badge.id} value={badge.id} className="bg-bg-0">
                {badge.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Кому показывать" htmlFor="vacancy-audience">
        <select
          id="vacancy-audience"
          value={form.audience}
          onChange={(event) =>
            patch({ audience: event.target.value as VacancyAudience })
          }
          className={INPUT}
        >
          {(
            Object.entries(VACANCY_AUDIENCE_LABELS) as Array<
              [VacancyAudience, string]
            >
          ).map(([value, label]) => (
            <option
              key={value}
              value={value}
              disabled={value === "my_community" && !form.communityId}
              className="bg-bg-0"
            >
              {label}
            </option>
          ))}
        </select>
      </Field>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || Boolean(problem)}
        title={problem ?? undefined}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-medium text-white transition disabled:opacity-50"
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {editing ? "Сохранить" : "Опубликовать"}
      </button>
      {problem && !error && (
        <p className="mt-2 text-center text-xs text-text-2">{problem}</p>
      )}
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-medium text-text-1"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export type { VacancyKind };
