"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  SelfIdentificationAnswers,
  SelfIdentificationState,
  SelfIdentificationSubmitResult,
  StageHistoryItem,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { fieldClassName } from "@/components/ui/input";
import {
  DEFAULT_ANSWERS,
  SelfIdentificationQuestions,
} from "./self-identification-questions";

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
    state?.latestAnswers ?? DEFAULT_ANSWERS,
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
      const res = await apiFetch(`${API_URL}/self-identification/submit`, {
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
      <Card className="p-6">
        <CardTitle className="mb-2 text-xl">
          Анкета самоидентификации
        </CardTitle>
        <p className="mb-6 text-sm text-text-1">
          Этап определяется системой по ответам. Это не ранг, а текущий этап пути.
        </p>

        <SelfIdentificationQuestions answers={answers} onChange={setAnswers} />

        {error && (
          <Alert tone="error" className="mt-4">
            {error}
          </Alert>
        )}

        <Button
          onClick={submit}
          loading={pending}
          className="mt-6 w-full py-3"
        >
          {pending ? "Сохраняем..." : "Определить мой этап"}
        </Button>
      </Card>

      {currentStage && (
        <Card className="border-gold/40 bg-gold/10 p-6">
          <p className="text-sm text-text-1">
            Текущий этап
          </p>
          <p className="font-display text-2xl font-bold text-text-0">
            {displayedStage}
          </p>
          {currentStatus && (
            <p className="mt-2 text-sm text-text-1">
              Статус подтверждения: {verificationLabels[currentStatus]}
            </p>
          )}
          {mentorLink && currentStatus !== "confirmed" && (
            <div className="mt-4 rounded-xl bg-bg-1 p-4 text-sm">
              <p className="mb-2 font-medium text-text-0">
                Ссылка для наставника
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={mentorLink}
                  aria-label="Ссылка для наставника"
                  className={`${fieldClassName} min-w-0 flex-1`}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button variant="secondary" onClick={copyMentorLink}>
                  {copiedMentorLink ? "Скопировано" : "Копировать"}
                </Button>
              </div>
              <p className="mt-2 text-text-2">
                Отправьте эту ссылку наставнику. Он сможет заполнить форму без регистрации.
              </p>
              <Button
                onClick={() => router.push("/")}
                className="mt-4 w-full sm:w-auto"
              >
                На главную страницу портала
              </Button>
            </div>
          )}
        </Card>
      )}

      {currentStage && (
        <Card className="p-6">
          <CardTitle className="mb-3 text-lg">
            Что дальше
          </CardTitle>
          <NextStep stage={currentStage} status={currentStatus} hasMentorLink={Boolean(mentorLink)} />
          {/* Анкета — первый экран после регистрации, и раньше она кончалась
              текстом «откройте каталог на главной». Выход из воронки не
              объясняют словами, его дают кнопкой. */}
          <Button
            onClick={() => router.push("/")}
            className="mt-4 w-full sm:w-auto"
          >
            Перейти к сервисам портала
          </Button>
        </Card>
      )}

      {history.length > 0 && (
        <Card className="p-6">
          <CardTitle className="mb-4 text-lg">
            История изменений
          </CardTitle>
          <div className="space-y-3">
            {history.map((item) => (
              <div key={item.id} className="rounded-xl bg-bg-1 p-3 text-sm">
                <p className="font-medium text-text-0">
                  {item.oldStage ? stageLabels[item.oldStage] : "Не определен"} → {stageLabels[item.newStage]}
                </p>
                <p className="text-text-2">
                  {new Date(item.createdAt).toLocaleString("ru-RU")} · {item.reason}
                </p>
              </div>
            ))}
          </div>
        </Card>
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
        <p className="text-sm text-text-1">
          Вы отображаетесь как “Преданный, подтвержден”. Закрытые сервисы,
          доступные подтвержденным преданным, будут отображаться в каталоге.
        </p>
      );
    }

    return (
      <div className="space-y-2 text-sm text-text-1">
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
          <li>Закрытые сервисы для проверенных пользователей откроются после проверки.</li>
        </ol>
      </div>
    );
  }

  return (
    <p className="text-sm text-text-1">
      Портал покажет материалы и приложения, подходящие вашему текущему этапу. Анкету можно пройти повторно в профиле, когда ваш путь изменится.
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
