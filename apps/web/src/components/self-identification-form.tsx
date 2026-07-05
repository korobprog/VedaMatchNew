"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
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
  confirmed: "Подтвержденный преданный",
  rejected: "Отклонен",
  needs_clarification: "Требует уточнения",
};

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
  const displayedStage = currentStage
    ? getStageDisplayName(currentStage, currentStatus)
    : null;

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
            {displayedStage}
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
              <button
                type="button"
                onClick={() => router.push("/")}
                className="mt-4 w-full rounded-lg bg-amber-600 px-4 py-2 font-medium text-white transition hover:bg-amber-700 sm:w-auto"
              >
                На главную страницу портала
              </button>
            </div>
          )}
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
          Вы отображаетесь как “Преданный, подтвержден”. Закрытые сервисы,
          доступные подтвержденным преданным, будут отображаться в каталоге.
        </p>
      );
    }

    return (
      <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Вы указали этап “Преданный”. Сейчас статус подтверждения: не
          подтвержден / ожидает наставника.
        </p>
        <ol className="list-inside list-decimal space-y-1">
          <li>{hasMentorLink ? "Скопируйте ссылку выше и отправьте ее наставнику." : "Дождитесь генерации ссылки наставника."}</li>
          <li>После заполнения формы заявка попадет администратору.</li>
          <li>
            Вы можете продолжить пользоваться порталом уже сейчас: обычные
            доступные сервисы останутся открыты.
          </li>
          <li>Закрытые сервисы для подтвержденных преданных откроются после проверки.</li>
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

function getStageDisplayName(
  stage: string,
  status: string | null | undefined,
) {
  if (stage !== "devotee") return stageLabels[stage];
  return status === "confirmed"
    ? "Преданный, подтвержден"
    : "Преданный, не подтвержден";
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




