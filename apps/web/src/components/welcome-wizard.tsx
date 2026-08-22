"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ProfileLocation,
  SelfIdentificationAnswers,
  UserProfile,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CityPicker } from "./city-picker";
import { UserGalleryEditor } from "./user-gallery-editor";
import {
  DEFAULT_ANSWERS,
  SelfIdentificationQuestions,
} from "./self-identification-questions";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const STEPS = ["Знакомство", "Город", "Фото", "Этап пути"] as const;

/** Чтобы подпись на странице не разошлась с числом шагов: она их и считает. */
export const WELCOME_STEP_COUNT = STEPS.length;

/**
 * Первые минуты после регистрации. Раньше человек попадал сразу в анкету
 * самоидентификации, а всё остальное — имя, город — узнавал потом из плашек
 * на главной, поштучно и без объяснения, зачем это. Мастер спрашивает то же
 * самое, но по порядку, с прогрессом и с причиной у каждого шага.
 *
 * Пропустить можно любой шаг, кроме последнего: этап пути определяется по
 * анкете, и без неё портал не знает, что показывать.
 */
export function WelcomeWizard({ user }: { user: UserProfile }) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [name, setName] = useState(user.name);
  const [spiritualName, setSpiritualName] = useState(user.spiritualName ?? "");
  const [homeLocation, setHomeLocation] = useState<ProfileLocation | null>(
    user.homeLocation ?? null,
  );
  const [answers, setAnswers] =
    useState<SelfIdentificationAnswers>(DEFAULT_ANSWERS);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = spiritualName.trim() || name.trim();

  async function saveProfile() {
    const res = await apiFetch(`${API_URL}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: name.trim(),
        spiritualName: spiritualName.trim() || null,
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
      const res = await apiFetch(`${API_URL}/self-identification/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(answers),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить ответы");
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <ProgressBar step={step} />

      {step === 0 && (
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
          {displayName && (
            <p className="mt-4 text-sm text-text-2">
              Вас будут видеть как{" "}
              <span className="font-medium text-text-0">{displayName}</span>.
            </p>
          )}
        </Card>
      )}

      {step === 1 && (
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
      {step === 2 && (
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

      {step === 3 && (
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

      <div className="flex flex-wrap items-center gap-3">
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
        {step < STEPS.length - 1 ? (
          <>
            <Button onClick={() => setStep(step + 1)}>Дальше</Button>
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="text-sm text-text-2 underline transition hover:text-text-1"
            >
              Пропустить шаг
            </button>
          </>
        ) : (
          <Button onClick={finish} loading={pending}>
            {pending ? "Сохраняем..." : "Готово, к сервисам портала"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div>
      <p className="mb-2 text-sm text-text-2">
        Шаг {step + 1} из {STEPS.length} · {STEPS[step]}
      </p>
      {/* Прогресс проговаривается словами выше, поэтому полоска — украшение
          и от скринридера скрыта: дважды одно и то же он читать не должен. */}
      <div
        aria-hidden
        className="flex gap-1.5"
      >
        {STEPS.map((title, index) => (
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
