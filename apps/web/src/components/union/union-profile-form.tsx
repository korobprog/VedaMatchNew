"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Gender,
  UnionChildrenStatus,
  UnionContactMode,
  UnionDiet,
  UnionEducationLevel,
  UnionFormat,
  UnionHousing,
  UnionIncomeLevel,
  UnionPrivacySettings,
  UnionProfileCompleteness,
  UnionProfileDto,
  UnionProfileState,
  UnionProfileUpdateRequest,
  UnionRegulativePrinciple,
  UnionSpiritualEducation,
  UnionVisibilityLevel,
} from "@vedamatch/shared";
import { IntentionWeights, intentionSum } from "./intention-constructor";
import { IntentionSection } from "./intention-section";
import {
  unionChildrenStatusLabels,
  unionDietLabels,
  unionEducationLabels,
  unionFamilyStatusOptions,
  unionHousingLabels,
  unionIncomeLabels,
  unionInterestOptions,
  unionPetOptions,
  unionRegulativePrincipleLabels,
  unionSkillCategories,
  unionSkillOptions,
  unionSpiritualEducationLabels,
  unionValueOptions,
} from "./dictionaries";
import { UnionTagPicker } from "./union-tag-picker";
import { UnionProfileProgress } from "./union-profile-progress";
import {
  UnionChoiceEditor,
  UnionFieldRow,
  UnionGenerateButton,
  UnionMultiChoiceEditor,
  UnionNumberEditor,
  UnionRangeEditor,
  UnionTextEditor,
} from "./union-field-row";
import { UnionHelpToggle } from "./union-help-toggle";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SAVE_DEBOUNCE_MS = 600;
// Совпадает с MIN/MAX_PROFILE_AGE на бэкенде
const MIN_PARTNER_AGE = 18;
const MAX_PARTNER_AGE = 100;
// Совпадает с UNION_* лимитами в union-profile.service.ts на стороне API.
const MIN_HEIGHT_CM = 120;
const MAX_HEIGHT_CM = 230;
const MAX_STATUS_LENGTH = 120;

const formatLabels: Record<UnionFormat, string> = {
  online: "Только онлайн",
  offline: "Только офлайн",
  any: "Онлайн и офлайн",
};

const privacyLabels: Record<UnionVisibilityLevel, string> = {
  everyone: "Видно всем",
  after_match: "После взаимного интереса",
  hidden: "Скрыто",
};

const privacyFields: Array<[keyof UnionPrivacySettings, string]> = [
  ["photo", "Фото"],
  ["age", "Возраст"],
  ["city", "Город"],
  ["contacts", "Контакты"],
];

/** Редактируемая часть анкеты; интенции хранятся отдельно в виде весов. */
type Draft = Omit<
  UnionProfileUpdateRequest,
  | "intentions"
  | "privacy"
  | "isActive"
  | "showcaseOptIn"
  | "requestsFromVerifiedOnly"
  | "contactMode"
  | "familySeeksGender"
> & {
  privacy: UnionPrivacySettings;
  isActive: boolean;
  showcaseOptIn: boolean;
  requestsFromVerifiedOnly: boolean;
  contactMode: UnionContactMode;
  familySeeksGender: Gender | null;
};

function toDraft(profile: UnionProfileDto | null): Draft {
  return {
    about: profile?.about ?? null,
    status: profile?.status ?? null,
    familyStatus: profile?.familyStatus ?? null,
    format: profile?.format ?? "any",
    relocationReady: profile?.relocationReady ?? false,
    languages: profile?.languages ?? [],
    skills: profile?.skills ?? [],
    interests: profile?.interests ?? [],
    values: profile?.values ?? [],
    heightCm: profile?.heightCm ?? null,
    diet: profile?.diet ?? null,
    regulativePrinciples: profile?.regulativePrinciples ?? [],
    childrenStatus: profile?.childrenStatus ?? null,
    education: profile?.education ?? null,
    spiritualEducation: profile?.spiritualEducation ?? null,
    housing: profile?.housing ?? null,
    income: profile?.income ?? null,
    pets: profile?.pets ?? [],
    ageRangeMin: profile?.ageRangeMin ?? null,
    ageRangeMax: profile?.ageRangeMax ?? null,
    privacy: profile?.privacy ?? {},
    isActive: profile?.isActive ?? true,
    showcaseOptIn: profile?.showcaseOptIn ?? false,
    requestsFromVerifiedOnly: profile?.requestsFromVerifiedOnly ?? false,
    contactMode: profile?.contactMode ?? "requests",
    familySeeksGender: profile?.familySeeksGender ?? null,
  };
}

function toWeights(profile: UnionProfileDto | null): IntentionWeights {
  const weights: IntentionWeights = {
    family: 0,
    business: 0,
    friendship: 0,
    service: 0,
  };
  // Ровные веса: неровный дефолт открывал бы каждому новичку режим процентов.
  if (!profile) return { family: 25, business: 25, friendship: 25, service: 25 };
  for (const intention of profile.intentions) {
    weights[intention.type] = intention.weight;
  }
  return weights;
}

/** Короткое представление списка в строке анкеты. */
function listValue(items: string[]): string | null {
  if (items.length === 0) return null;
  if (items.length <= 3) return items.join(", ");
  return `${items.slice(0, 3).join(", ")} +${items.length - 3}`;
}

function entries<T extends string>(labels: Record<T, string>): Array<[T, string]> {
  return Object.entries(labels) as Array<[T, string]>;
}

const sectionClass = "glass mb-4 rounded-2xl border border-glass-brd p-4";
const sectionTitleClass =
  "mb-2 text-xs font-semibold uppercase tracking-wide text-text-2";
const selectClass =
  "w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

/**
 * Поле, которое анкета показывает, но не правит: рассказ о себе и языки живут
 * в портальном профиле и одинаковы во всех сервисах. Ссылка ведёт туда, где
 * их меняют, — иначе человек ищет, почему поле «не нажимается».
 */
function PortalFieldRow({
  label,
  value,
  empty,
}: {
  label: string;
  value: string | null;
  empty: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-glass-brd/60 py-3 last:border-b-0">
      <div className="min-w-0">
        <span className="block text-xs text-text-2">{label}</span>
        <span className="block text-sm text-text-0">{value ?? empty}</span>
      </div>
      <Link
        href="/profile"
        className="shrink-0 rounded-xl border border-glass-brd px-3 py-1.5 text-xs font-medium text-text-1 hover:text-text-0"
      >
        В профиле
      </Link>
    </div>
  );
}

export function UnionProfileForm({
  profile,
  completeness: initialCompleteness,
  viewerGender = null,
  viewerAge = null,
}: {
  profile: UnionProfileDto | null;
  completeness: UnionProfileCompleteness;
  /** Пол из аккаунта: по нему подставляется, кого искать при цели «семья». */
  viewerGender?: Gender | null;
  /** Возраст из аккаунта: цель «Создание семьи» доступна только с 18 лет. */
  viewerAge?: number | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile));
  const [weights, setWeights] = useState<IntentionWeights>(() =>
    toWeights(profile),
  );
  const [completeness, setCompleteness] = useState(initialCompleteness);
  const [created, setCreated] = useState(profile !== null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  // Накопленный патч и таймер: правки одного поля не должны затирать соседние.
  const pending = useRef<UnionProfileUpdateRequest | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weightsRef = useRef(weights);
  useEffect(() => {
    weightsRef.current = weights;
  }, [weights]);

  const sumOk = intentionSum(weights) === 100;

  const flush = useCallback(async () => {
    const body = pending.current;
    pending.current = null;
    if (!body) return;
    setSaveState("saving");
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/union/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const state = (await res.json()) as UnionProfileState;
      setCompleteness(state.completeness);
      setCreated(true);
      setSaveState("saved");
      router.refresh();
    } catch (e) {
      setSaveState("error");
      setError(e instanceof Error ? e.message : "Не удалось сохранить профиль");
    }
  }, [router]);

  const save = useCallback(
    (patch: Partial<UnionProfileUpdateRequest>) => {
      pending.current = {
        ...(pending.current ?? {}),
        ...patch,
        // Бэкенд требует намерения в каждом запросе.
        intentions: (
          Object.entries(weightsRef.current) as Array<
            [keyof IntentionWeights, number]
          >
        )
          .filter(([, weight]) => weight > 0)
          .map(([type, weight]) => ({ type, weight })),
      };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** Меняет поле анкеты и ставит его в очередь на сохранение. */
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    save({ [key]: value } as Partial<UnionProfileUpdateRequest>);
  }

  function updateWeights(next: IntentionWeights) {
    setWeights(next);
    weightsRef.current = next;
    if (intentionSum(next) === 100) save({});
  }

  const familyStatusOptions = unionFamilyStatusOptions.filter(
    (option) => option.value !== "",
  );

  return (
    <div>
      <UnionProfileProgress completeness={completeness} saveState={saveState} />

      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Статус</h2>
        <UnionFieldRow
          label="Короткий статус"
          value={draft.status ?? null}
          hint="Одна фраза, которую увидят первой"
        >
          {(close) => (
            <UnionTextEditor
              value={draft.status ?? ""}
              maxLength={MAX_STATUS_LENGTH}
              placeholder="Расскажите что-нибудь…"
              onApply={(value) => update("status", value.trim() || null)}
              close={close}
            />
          )}
        </UnionFieldRow>
        <UnionGenerateButton
          field="status"
          label="Сгенерировать статус"
          onGenerated={(text) => update("status", text)}
        />
        {/* Рассказ о себе — портальный: он же показывается в справочнике
            участников, и писать его дважды человек больше не должен. */}
        <PortalFieldRow
          label="О себе"
          value={draft.about ?? null}
          empty="Не заполнено — расскажите о себе в профиле"
        />
      </section>

      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Цель знакомства</h2>
        <IntentionSection
          weights={weights}
          onChange={updateWeights}
          viewerGender={viewerGender}
          viewerAge={viewerAge}
          seeksGender={draft.familySeeksGender}
          onSeeksGenderChange={(next) => update("familySeeksGender", next)}
        />
        {!sumOk && (
          <p className="mt-2 text-xs text-magenta">
            Пока сумма приоритетов не равна 100, изменения не сохраняются.
          </p>
        )}
        <div className="mt-3">
          <UnionFieldRow
            label="Желаемый возраст партнёра"
            value={
              draft.ageRangeMin == null && draft.ageRangeMax == null
                ? null
                : `от ${draft.ageRangeMin ?? MIN_PARTNER_AGE} до ${draft.ageRangeMax ?? MAX_PARTNER_AGE} лет`
            }
          >
            {(close) => (
              <UnionRangeEditor
                min={draft.ageRangeMin ?? null}
                max={draft.ageRangeMax ?? null}
                lowerBound={MIN_PARTNER_AGE}
                upperBound={MAX_PARTNER_AGE}
                onApply={(min, max) => {
                  setDraft((current) => ({
                    ...current,
                    ageRangeMin: min,
                    ageRangeMax: max,
                  }));
                  save({ ageRangeMin: min, ageRangeMax: max });
                }}
                close={close}
              />
            )}
          </UnionFieldRow>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>О себе</h2>

        <UnionFieldRow label="Рост" value={draft.heightCm ? `${draft.heightCm} см` : null}>
          {(close) => (
            <UnionNumberEditor
              value={draft.heightCm ?? null}
              min={MIN_HEIGHT_CM}
              max={MAX_HEIGHT_CM}
              unit="см"
              onApply={(value) => update("heightCm", value)}
              close={close}
            />
          )}
        </UnionFieldRow>

        <UnionFieldRow label="Семейный статус" value={draft.familyStatus ?? null}>
          {(close) => (
            <UnionChoiceEditor
              options={familyStatusOptions.map(
                (option): [string, string] => [option.value, option.label],
              )}
              value={draft.familyStatus ?? null}
              onPick={(value) => {
                update("familyStatus", value);
                close();
              }}
            />
          )}
        </UnionFieldRow>

        <UnionFieldRow
          label="Дети"
          value={
            draft.childrenStatus
              ? unionChildrenStatusLabels[draft.childrenStatus]
              : null
          }
        >
          {(close) => (
            <UnionChoiceEditor
              options={entries(unionChildrenStatusLabels)}
              value={draft.childrenStatus ?? null}
              onPick={(value) => {
                update("childrenStatus", value as UnionChildrenStatus | null);
                close();
              }}
            />
          )}
        </UnionFieldRow>

        <UnionFieldRow
          label="Питание"
          value={draft.diet ? unionDietLabels[draft.diet] : null}
        >
          {(close) => (
            <UnionChoiceEditor
              options={entries(unionDietLabels)}
              value={draft.diet ?? null}
              onPick={(value) => {
                update("diet", value as UnionDiet | null);
                close();
              }}
            />
          )}
        </UnionFieldRow>

        <UnionFieldRow
          label="Регулирующие принципы"
          value={
            draft.regulativePrinciples && draft.regulativePrinciples.length > 0
              ? `следую: ${draft.regulativePrinciples.length} из 4`
              : null
          }
          hint="Отметьте те, которым следуете. Пустой список означает «не указано»."
        >
          {(close) => (
            <UnionMultiChoiceEditor
              options={entries(unionRegulativePrincipleLabels)}
              values={draft.regulativePrinciples ?? []}
              onApply={(values) =>
                update("regulativePrinciples", values as UnionRegulativePrinciple[])
              }
              close={close}
            />
          )}
        </UnionFieldRow>

        <UnionFieldRow
          label="Образование"
          value={draft.education ? unionEducationLabels[draft.education] : null}
        >
          {(close) => (
            <UnionChoiceEditor
              options={entries(unionEducationLabels)}
              value={draft.education ?? null}
              onPick={(value) => {
                update("education", value as UnionEducationLevel | null);
                close();
              }}
            />
          )}
        </UnionFieldRow>

        <UnionFieldRow
          label="Духовное образование"
          value={
            draft.spiritualEducation
              ? unionSpiritualEducationLabels[draft.spiritualEducation]
              : null
          }
        >
          {(close) => (
            <UnionChoiceEditor
              options={entries(unionSpiritualEducationLabels)}
              value={draft.spiritualEducation ?? null}
              onPick={(value) => {
                update(
                  "spiritualEducation",
                  value as UnionSpiritualEducation | null,
                );
                close();
              }}
            />
          )}
        </UnionFieldRow>

        <UnionFieldRow
          label="Жилищные условия"
          value={draft.housing ? unionHousingLabels[draft.housing] : null}
        >
          {(close) => (
            <UnionChoiceEditor
              options={entries(unionHousingLabels)}
              value={draft.housing ?? null}
              onPick={(value) => {
                update("housing", value as UnionHousing | null);
                close();
              }}
            />
          )}
        </UnionFieldRow>

        <UnionFieldRow
          label="Материальная обеспеченность"
          value={draft.income ? unionIncomeLabels[draft.income] : null}
          hint="Поле необязательное: можно не указывать вовсе"
        >
          {(close) => (
            <UnionChoiceEditor
              options={entries(unionIncomeLabels)}
              value={draft.income ?? null}
              onPick={(value) => {
                update("income", value as UnionIncomeLevel | null);
                close();
              }}
            />
          )}
        </UnionFieldRow>

        <PortalFieldRow
          label="Знание языков"
          value={listValue(draft.languages ?? [])}
          empty="Не указаны — добавьте их в профиле"
        />

        <UnionFieldRow
          label="Домашние животные"
          value={listValue(draft.pets ?? [])}
        >
          {() => (
            <UnionTagPicker
              label="Домашние животные"
              selected={draft.pets ?? []}
              options={unionPetOptions}
              onChange={(pets) => update("pets", pets)}
              placeholder="Например: кошка"
            />
          )}
        </UnionFieldRow>
      </section>

      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Интересы и навыки</h2>

        <UnionFieldRow
          label="Интересы"
          value={listValue(draft.interests ?? [])}
          hint="Участвуют в расчёте совместимости"
        >
          {() => (
            <UnionTagPicker
              label="Интересы"
              selected={draft.interests ?? []}
              options={unionInterestOptions}
              onChange={(interests) => update("interests", interests)}
              placeholder="Например: йога, философия, служение"
            />
          )}
        </UnionFieldRow>

        <UnionFieldRow
          label="Ценности"
          value={listValue(draft.values ?? [])}
          hint="Участвуют в расчёте совместимости"
        >
          {() => (
            <UnionTagPicker
              label="Ценности"
              selected={draft.values ?? []}
              options={unionValueOptions}
              onChange={(values) => update("values", values)}
              placeholder="Например: семья, честность, совместная практика"
            />
          )}
        </UnionFieldRow>

        <UnionFieldRow label="Навыки" value={listValue(draft.skills ?? [])}>
          {() => (
            <UnionTagPicker
              label="Навыки"
              selected={draft.skills ?? []}
              options={unionSkillOptions}
              onChange={(skills) => update("skills", skills)}
              placeholder="Например: программирование, киртан, кулинария"
              helperText={`Категории: ${unionSkillCategories
                .map((category) => category.title)
                .join(", ")}.`}
            />
          )}
        </UnionFieldRow>
      </section>

      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Общение и приватность</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="union-format"
              className="mb-1 block text-sm text-text-1"
            >
              Формат общения
            </label>
            <select
              id="union-format"
              value={draft.format ?? "any"}
              onChange={(event) =>
                update("format", event.target.value as UnionFormat)
              }
              className={selectClass}
            >
              {(Object.keys(formatLabels) as UnionFormat[]).map((value) => (
                <option key={value} value={value}>
                  {formatLabels[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={draft.relocationReady ?? false}
            onChange={(event) =>
              update("relocationReady", event.target.checked)
            }
            className="h-4 w-4 accent-magenta"
          />
          Готов(а) к переезду
        </label>

        <label className="mt-3 flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) => update("isActive", event.target.checked)}
            className="h-4 w-4 accent-magenta"
          />
          Показывать профиль в рекомендациях
        </label>
        {!draft.isActive && (
          <p className="mt-1 pl-6 text-xs text-text-2">
            Профиль исчезнет из рекомендаций, но существующие связи и чаты
            останутся доступными.
          </p>
        )}

        {/* Согласие на публичную витрину. Отдельно от настроек приватности
            ниже: те открывают данные участникам портала, а здесь речь про
            страницу, которую видит любой в интернете. */}
        <UnionHelpToggle
          label="Подробнее о публичной странице"
          control={
            <label className="flex items-center gap-2 text-sm text-text-1">
              <input
                type="checkbox"
                checked={draft.showcaseOptIn}
                onChange={(event) =>
                  update("showcaseOptIn", event.target.checked)
                }
                className="h-4 w-4 shrink-0 accent-magenta"
              />
              Показывать мою анкету на публичной странице Знакомств
            </label>
          }
        >
          <p>
            Страницу сервиса видят гости и поисковики — без входа на портал.
            Это отдельное согласие: настройки приватности ниже открывают данные
            участникам портала, а не всему интернету.
          </p>
          <p>
            На страницу попадают только фото, проверенные администрацией, и
            только те поля, которые вы открыли «всем». Галочку можно снять в
            любой момент.
          </p>
          {profile?.showcaseBlocked && (
            <p className="text-gold">
              Администрация временно сняла анкету с публичной страницы. Ваше
              согласие сохранено — на портале анкета показывается как обычно.
            </p>
          )}
        </UnionHelpToggle>

        <UnionHelpToggle
          label="Подробнее о запросах только от подтверждённых"
          control={
            <label className="flex items-center gap-2 text-sm text-text-1">
              <input
                type="checkbox"
                checked={draft.requestsFromVerifiedOnly}
                onChange={(event) =>
                  update("requestsFromVerifiedOnly", event.target.checked)
                }
                className="h-4 w-4 shrink-0 accent-magenta"
              />
              Принимать запросы только от подтверждённых администрацией
            </label>
          }
        >
          <p>
            Подтверждение выдаёт администрация портала после проверки — у таких
            людей в карточке стоит значок «Проверен».
          </p>
          <p>
            С включённой настройкой ваш профиль остаётся в рекомендациях и виден
            всем, но отправить вам запрос на знакомство смогут только
            подтверждённые. Остальные увидят отказ с объяснением причины.
          </p>
          <p>
            Настройка касается только новых запросов: уже существующие связи и
            переписки останутся на месте, а вы сами по-прежнему сможете писать
            кому угодно.
          </p>
          <p>
            В справочнике людей приём обращений настраивается отдельно — эта
            галка на него не влияет.
          </p>
        </UnionHelpToggle>

        <div className="mt-4">
          <label
            htmlFor="union-contact-mode"
            className="mb-1 block text-sm font-medium text-text-0"
          >
            Кто может со мной связаться
          </label>
          <select
            id="union-contact-mode"
            value={draft.contactMode}
            onChange={(event) =>
              update("contactMode", event.target.value as UnionContactMode)
            }
            className={selectClass}
          >
            <option value="requests">Заявки от всех</option>
            <option value="mutual_only">Только взаимные лайки</option>
          </select>
          <p className="mt-1 text-xs text-text-2">
            {draft.contactMode === "mutual_only"
              ? "Односторонние заявки вам не приходят: общение открывается, только когда лайк взаимный."
              : "Понравившийся человек может написать вам заявку, а вы ответите взаимностью или откажете."}
          </p>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-text-0">
            Что видно другим
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {privacyFields.map(([key, label]) => (
              <div key={key}>
                <label
                  htmlFor={`union-privacy-${key}`}
                  className="mb-1 block text-sm text-text-1"
                >
                  {label}
                </label>
                <select
                  id={`union-privacy-${key}`}
                  value={draft.privacy[key] ?? "everyone"}
                  onChange={(event) =>
                    update("privacy", {
                      ...draft.privacy,
                      [key]: event.target.value as UnionVisibilityLevel,
                    })
                  }
                  className={selectClass}
                >
                  {(Object.keys(privacyLabels) as UnionVisibilityLevel[]).map(
                    (value) => (
                      <option key={value} value={value}>
                        {privacyLabels[value]}
                      </option>
                    ),
                  )}
                </select>
              </div>
            ))}
          </div>
        </fieldset>
      </section>

      {error && <p className="mb-4 text-sm text-magenta">{error}</p>}

      {created ? (
        <a
          href="/union/recommendations"
          className="block rounded-xl bg-magenta py-3 text-center text-sm font-medium text-white transition hover:opacity-90"
        >
          Смотреть рекомендации
        </a>
      ) : (
        <button
          type="button"
          disabled={!sumOk || saveState === "saving"}
          onClick={async () => {
            save({});
            if (timer.current) clearTimeout(timer.current);
            await flush();
          }}
          className="w-full rounded-xl bg-magenta py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {saveState === "saving" ? "Сохранение…" : "Создать профиль Union"}
        </button>
      )}
    </div>
  );
}
