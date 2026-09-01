"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  findNameError,
  type ProfileLocation,
  type SelfIdentificationAnswers,
  type UserProfile,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { welcomeSteps, type WelcomeStep } from "@/lib/welcome";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CityPicker } from "./city-picker";
import { NameHints } from "./name-hints";
import { UserGalleryEditor } from "./user-gallery-editor";
import {
  DEFAULT_ANSWERS,
  SelfIdentificationQuestions,
} from "./self-identification-questions";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const GENDER_OPTIONS: Array<[string, string]> = [
  ["male", "Мужской"],
  ["female", "Женский"],
];

/**
 * Первые минуты после регистрации. Раньше человек попадал сразу в анкету
 * самоидентификации, а всё остальное — имя, город — узнавал потом из плашек
 * на главной, поштучно и без объяснения, зачем это. Мастер спрашивает то же
 * самое, но по порядку, с прогрессом и с причиной у каждого шага.
 *
 * Пропустить можно любой шаг, кроме первого и последнего: без пола не
 * работает подбор в Знакомствах, а этап пути определяется по анкете, и без
 * неё портал не знает, что показывать.
 */
export function WelcomeWizard({ user }: { user: UserProfile }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [steps] = useState(() => welcomeSteps(user));

  const [name, setName] = useState(user.name);
  const [spiritualName, setSpiritualName] = useState(user.spiritualName ?? "");
  const [gender, setGender] = useState<string>(user.gender ?? "");
  const [homeLocation, setHomeLocation] = useState<ProfileLocation | null>(
    user.homeLocation ?? null,
  );
  const [answers, setAnswers] =
    useState<SelfIdentificationAnswers>(DEFAULT_ANSWERS);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = spiritualName.trim() || name.trim();
  /**
   * Уйти с «Знакомства» можно, только когда пол выбран, а имя не мусор.
   * Странное написание кнопку не держит: это подсказка, а не запрет.
   */
  const canLeaveStep =
    steps[step] !== "Знакомство" ||
    (Boolean(gender) &&
      !findNameError(name) &&
      !(spiritualName.trim() && findNameError(spiritualName)));

  async function saveProfile() {
    const res = await apiFetch(`${API_URL}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: name.trim(),
        spiritualName: spiritualName.trim() || null,
        gender,
        homeLocation,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
  }

  /**
   * Профиль и анкета уезжают вместе в самом конце: до последнего шага человек
   * ходит назад и правит ответы, и промежуточные сохранения оставляли бы в
   * базе состояния, которые он уже передумал.
   */
  async function finish() {
    setPending(true);
    setError(null);
    try {
      await saveProfile();
      // Анкету отправляем только если её показывали: у старого аккаунта,
      // которого мастер догоняет ради пола, этап пути уже определён, и
      // ответы по умолчанию переписали бы его на чужие.
      if (steps.includes("Этап пути")) {
        const res = await apiFetch(`${API_URL}/self-identification/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(answers),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить ответы");
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <ProgressBar step={step} steps={steps} />

      {steps[step] === "Знакомство" && (
        <Card className="p-6">
          <CardTitle className="mb-2 text-xl">Как вас называть</CardTitle>
          <p className="mb-6 text-sm text-text-1">
            Если укажете духовное имя, другие участники увидят именно его — в
            знакомствах, справочнике, чатах и комментариях. Обычное имя
            останется видно только вам и администрации.
          </p>
          <div className="space-y-4">
            <Input
              label="Обычное имя"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              label="Духовное имя"
              placeholder="Необязательно"
              value={spiritualName}
              onChange={(event) => setSpiritualName(event.target.value)}
            />
          </div>
          <NameHints value={name} label="обычном имени" />
          <NameHints value={spiritualName} label="духовном имени" />
          {displayName && (
            <p className="mt-4 text-sm text-text-2">
              Вас будут видеть как{" "}
              <span className="font-medium text-text-0">{displayName}</span>.
            </p>
          )}

          {/* Пол — единственное обязательное поле мастера, кроме анкеты:
              без него подбор в Знакомствах не показывает человека никому и
              не знает, кого показать ему. Раньше вопрос жил только в
              профиле, и половина людей до него не доходила. */}
          <fieldset className="mt-6">
            <legend className="mb-1 text-sm font-medium text-text-0">
              Ваш пол
            </legend>
            <p className="mb-3 text-sm text-text-1">
              По нему работает подбор в Знакомствах и обращения в текстах
              портала. Этот шаг пропустить нельзя.
            </p>
            <div className="flex flex-wrap gap-2">
              {GENDER_OPTIONS.map(([value, label]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-xl border px-4 py-2 text-sm transition ${
                    gender === value
                      ? "border-magenta bg-magenta/10 text-text-0"
                      : "border-glass-brd text-text-1 hover:text-text-0"
                  }`}
                >
                  <input
                    type="radio"
                    name="gender"
                    value={value}
                    checked={gender === value}
                    onChange={(event) => setGender(event.target.value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
      )}

      {steps[step] === "Город" && (
        <Card className="p-6">
          <CardTitle className="mb-2 text-xl">Откуда вы</CardTitle>
          <p className="mb-6 text-sm text-text-1">
            Город нужен Объявлениям и Контактам: без него портал не покажет,
            что происходит рядом с вами. Геолокация сама не запрашивается.
          </p>
          <CityPicker
            value={homeLocation}
            onChange={setHomeLocation}
            onError={setError}
          />
        </Card>
      )}

      {/* Фото просят здесь, а не «когда-нибудь потом в профиле»: это
          единственная минута, когда человек настроен заполнять анкету.
          Шаг пропускаемый — но с названной причиной, а не с процентом. */}
      {steps[step] === "Фото" && (
        <Card className="p-6">
          <CardTitle className="mb-2 text-xl">Ваши фото</CardTitle>
          {/* Только причина: как именно всё работает, галерея ниже говорит
              сама, и повторять это здесь значит писать дважды одно и то же. */}
          <p className="mb-6 text-sm text-text-1">
            Анкеты с фото показываются в Знакомствах выше — без снимка вас
            видят по маленькой аватарке и чаще пролистывают.
          </p>
          <UserGalleryEditor />
        </Card>
      )}

      {steps[step] === "Этап пути" && (
        <Card className="p-6">
          <CardTitle className="mb-2 text-xl">Где вы на пути</CardTitle>
          <p className="mb-6 text-sm text-text-1">
            Этап определяется системой по ответам. Это не ранг, а текущий этап
            пути — по нему портал подбирает сервисы и материалы. Анкету можно
            пройти заново в любой момент.
          </p>
          <SelfIdentificationQuestions answers={answers} onChange={setAnswers} />
        </Card>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {/* Панель шага липнет к низу: на «Городе» под подсказками, чипами,
          двумя кнопками и картой «Дальше» уезжала за экран, и человек читал
          это как тупик. Сплошная подложка и рамка сверху — иначе текст
          проезжает сквозь кнопки. Отрицательные поля растягивают её на всю
          ширину карточки, как в `review-actions.tsx`. */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-glass-brd bg-bg-0/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        {step > 0 && (
          <Button
            variant="secondary"
            onClick={() => {
              setError(null);
              setStep(step - 1);
            }}
          >
            Назад
          </Button>
        )}
        {step < steps.length - 1 ? (
          <>
            <Button onClick={() => setStep(step + 1)} disabled={!canLeaveStep}>
              Дальше
            </Button>
            {/* Первый шаг непропускаемый: пол обязателен. */}
            {steps[step] !== "Знакомство" && (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="text-sm text-text-2 underline transition hover:text-text-1"
              >
                Пропустить шаг
              </button>
            )}
          </>
        ) : (
          <Button onClick={finish} loading={pending} disabled={!canLeaveStep}>
            {pending ? "Сохраняем..." : "Готово, к сервисам портала"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ step, steps }: { step: number; steps: WelcomeStep[] }) {
  return (
    <div>
      <p className="mb-2 text-sm text-text-2">
        Шаг {step + 1} из {steps.length} · {steps[step]}
      </p>
      {/* Прогресс проговаривается словами выше, поэтому полоска — украшение
          и от скринридера скрыта: дважды одно и то же он читать не должен. */}
      <div
        aria-hidden
        className="flex gap-1.5"
      >
        {steps.map((title, index) => (
          <span
            key={title}
            className={`h-1.5 flex-1 rounded-full ${
              index <= step ? "bg-magenta" : "bg-glass-brd"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
