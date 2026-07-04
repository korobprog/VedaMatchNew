"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  PortalUseStage,
  SelfIdentificationAnswers,
  SelfIdentificationState,
  SelfIdentificationSubmitResult,
  StageHistoryItem,
} from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const stageLabels: Record<string, string> = {
  seeker: "Ищущий",
  practitioner: "Практикующий основы",
  yogi: "Йог",
  devotee: "Преданный",
};

const verificationLabels: Record<string, string> = {
  self_identified: "Самоопределен",
  awaiting_mentor: "Ожидает наставника",
  mentor_submitted: "Наставник заполнил форму",
  awaiting_admin: "Ожидает администратора",
  confirmed: "Подтвержден",
  rejected: "Отклонен",
  needs_clarification: "Требует уточнения",
};

const temporaryStageOptions: Array<[PortalUseStage, string, string]> = [
  [
    "seeker",
    "Ищущий",
    "Открыть базовые материалы и начать знакомство с порталом.",
  ],
  [
    "practitioner",
    "Практикующий",
    "Продолжить с сервисами для базовой регулярной практики.",
  ],
  ["yogi", "Йог", "Получить доступ к материалам для углубленной практики."],
];

const pendingVerificationStatuses = new Set([
  "awaiting_mentor",
  "mentor_submitted",
  "awaiting_admin",
]);

const defaultAnswers: SelfIdentificationAnswers = {
  interest: "beginning",
  regularPractice: "none",
  currentFocus: "curiosity",
  hasMentor: false,
  hasCommunity: false,
  hasSpiritualName: false,
  participatesInService: false,
  wantsRecommendations: true,
};

export function SelfIdentificationForm({
  state,
  history,
}: {
  state: SelfIdentificationState | null;
  history: StageHistoryItem[];
}) {
  const router = useRouter();
  const [localState, setLocalState] = useState<
    SelfIdentificationState | SelfIdentificationSubmitResult | null
  >(null);
  const [answers, setAnswers] = useState<SelfIdentificationAnswers>(
    state?.latestAnswers ?? defaultAnswers,
  );
  const [pending, setPending] = useState(false);
  const [stagePending, setStagePending] = useState<PortalUseStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedMentorLink, setCopiedMentorLink] = useState(false);

  const visibleState = localState ?? state;
  const mentorPath: string | null =
    (visibleState && "mentorLinkPath" in visibleState
      ? (visibleState as SelfIdentificationSubmitResult).mentorLinkPath
      : null) ??
    (visibleState?.activeMentorRequest
      ? `/mentor-verification/${visibleState.activeMentorRequest.token}`
      : null);
  const mentorLink = mentorPath;

  async function submit() {
    setPending(true);
    setError(null);
    setCopiedMentorLink(false);
    try {
      const res = await fetch(`${API_URL}/self-identification/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(answers),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as SelfIdentificationSubmitResult;
      setLocalState(json);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить анкету");
    } finally {
      setPending(false);
    }
  }

  const currentStage = visibleState?.spiritualStage;
  const currentStatus = visibleState?.devoteeVerificationStatus;
  const canSelectTemporaryStage =
    Boolean(currentStatus) &&
    pendingVerificationStatuses.has(currentStatus as string);

  async function selectTemporaryStage(stage: PortalUseStage) {
    setStagePending(stage);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/self-identification/use-stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as SelfIdentificationState;
      setLocalState(json);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось изменить тип аккаунта",
      );
    } finally {
      setStagePending(null);
    }
  }

  async function copyMentorLink() {
    if (!mentorLink) return;
    await navigator.clipboard.writeText(
      new URL(mentorLink, window.location.origin).toString(),
    );
    setCopiedMentorLink(true);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Анкета самоидентификации
        </h2>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Этап определяется системой по ответам. Это не ранг, а текущий этап пути.
        </p>

        <div className="space-y-5">
          <SelectField
            label="Как бы вы описали свой интерес к самоосознанию?"
            value={answers.interest}
            onChange={(interest) => setAnswers({ ...answers, interest })}
            options={[
              ["beginning", "Только начинаю интересоваться"],
              ["learning", "Изучаю основы и пробую применять"],
              ["deepening", "Хочу углублять регулярную практику"],
              ["devotional_service", "Живу практикой, служением и общиной"],
            ]}
          />
          <SelectField
            label="Есть ли у вас регулярная духовная практика?"
            value={answers.regularPractice}
            onChange={(regularPractice) =>
              setAnswers({ ...answers, regularPractice })
            }
            options={[
              ["none", "Пока нет"],
              ["sometimes", "Иногда"],
              ["daily", "Ежедневно"],
              ["strict_daily", "Строго и ежедневно"],
            ]}
          />
          <SelectField
            label="Что вам сейчас ближе всего?"
            value={answers.currentFocus}
            onChange={(currentFocus) => setAnswers({ ...answers, currentFocus })}
            options={[
              ["curiosity", "Понять, подходит ли мне этот путь"],
              ["basic_practice", "Освоить базовую практику"],
              ["deep_practice", "Углубить практику"],
              ["service_community", "Служение и жизнь в общине"],
            ]}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <CheckboxField
              label="Есть наставник"
              checked={answers.hasMentor}
              onChange={(hasMentor) => setAnswers({ ...answers, hasMentor })}
            />
            <CheckboxField
              label="Есть связь с общиной"
              checked={answers.hasCommunity}
              onChange={(hasCommunity) =>
                setAnswers({ ...answers, hasCommunity })
              }
            />
            <CheckboxField
              label="Есть духовное имя"
              checked={answers.hasSpiritualName}
              onChange={(hasSpiritualName) =>
                setAnswers({ ...answers, hasSpiritualName })
              }
            />
            <CheckboxField
              label="Участвую в служении"
              checked={answers.participatesInService}
              onChange={(participatesInService) =>
                setAnswers({ ...answers, participatesInService })
              }
            />
            <CheckboxField
              label="Хочу получать рекомендации по развитию"
              checked={answers.wantsRecommendations}
              onChange={(wantsRecommendations) =>
                setAnswers({ ...answers, wantsRecommendations })
              }
            />
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="mt-6 w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {pending ? "Сохраняем..." : "Определить мой этап"}
        </button>
      </div>

      {currentStage && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            Текущий этап
          </p>
          <p className="text-2xl font-bold text-amber-950 dark:text-amber-100">
            {stageLabels[currentStage]}
          </p>
          {currentStatus && (
            <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">
              Статус подтверждения: {verificationLabels[currentStatus]}
            </p>
          )}
          {mentorLink && currentStatus !== "confirmed" && (
            <div className="mt-4 rounded-xl bg-white p-4 text-sm dark:bg-zinc-900">
              <p className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
                Ссылка для наставника
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={mentorLink}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={copyMentorLink}
                  className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  {copiedMentorLink ? "Скопировано" : "Копировать"}
                </button>
              </div>
              <p className="mt-2 text-zinc-500">
                Отправьте эту ссылку наставнику. Он сможет заполнить форму без регистрации.
              </p>
            </div>
          )}
        </div>
      )}

      {canSelectTemporaryStage && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-6 dark:border-sky-900 dark:bg-sky-950/40">
          <h2 className="mb-2 text-lg font-semibold text-sky-950 dark:text-sky-100">
            Проверка продолжается — портал доступен
          </h2>
          <p className="mb-4 text-sm text-sky-900 dark:text-sky-200">
            Пока куратор подтверждает статус преданного, вы можете пользоваться
            порталом в другом типе аккаунта. Проверка не отменится: после
            подтверждения система автоматически откроет доступ преданного.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {temporaryStageOptions.map(([stage, label, description]) => {
              const selected = currentStage === stage;
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => selectTemporaryStage(stage)}
                  disabled={selected || stagePending !== null}
                  className="rounded-xl border border-sky-200 bg-white p-4 text-left transition hover:border-sky-400 hover:shadow-sm disabled:cursor-not-allowed disabled:border-sky-300 disabled:bg-sky-100 dark:border-sky-800 dark:bg-zinc-900 dark:hover:border-sky-600 dark:disabled:bg-sky-950"
                >
                  <span className="block font-medium text-zinc-900 dark:text-zinc-100">
                    {label}
                  </span>
                  <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-400">
                    {selected
                      ? "Сейчас выбран для доступа к порталу."
                      : description}
                  </span>
                  {!selected && (
                    <span className="mt-3 block text-sm font-medium text-sky-700 dark:text-sky-300">
                      {stagePending === stage ? "Переключаем..." : "Выбрать"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {currentStage && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Что дальше
          </h2>
          <NextStep stage={currentStage} status={currentStatus} hasMentorLink={Boolean(mentorLink)} />
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            История изменений
          </h2>
          <div className="space-y-3">
            {history.map((item) => (
              <div key={item.id} className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {item.oldStage ? stageLabels[item.oldStage] : "Не определен"} → {stageLabels[item.newStage]}
                </p>
                <p className="text-zinc-500">
                  {new Date(item.createdAt).toLocaleString("ru-RU")} · {item.reason}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NextStep({
  stage,
  status,
  hasMentorLink,
}: {
  stage: string;
  status: string | null | undefined;
  hasMentorLink: boolean;
}) {
  if (stage === "devotee") {
    if (status === "confirmed") {
      return (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Статус подтвержден. Закрытые сервисы, доступные подтвержденным преданным, будут отображаться в каталоге.
        </p>
      );
    }

    return (
      <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Следующий шаг — подтверждение наставником и проверка администратором.
        </p>
        <ol className="list-inside list-decimal space-y-1">
          <li>{hasMentorLink ? "Скопируйте ссылку выше и отправьте ее наставнику." : "Дождитесь генерации ссылки наставника."}</li>
          <li>После заполнения формы заявка попадет администратору.</li>
          <li>
            Пока идет проверка, выберите другой тип аккаунта выше и пользуйтесь
            доступными сервисами портала.
          </li>
          <li>После подтверждения откроется доступ к закрытым сервисам.</li>
        </ol>
      </div>
    );
  }

  return (
    <p className="text-sm text-zinc-600 dark:text-zinc-400">
      Откройте каталог сервисов на главной странице: портал покажет материалы и приложения, подходящие вашему текущему этапу. Анкету можно пройти повторно в профиле, когда ваш путь изменится.
    </p>
  );
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-amber-600"
      />
      {label}
    </label>
  );
}




