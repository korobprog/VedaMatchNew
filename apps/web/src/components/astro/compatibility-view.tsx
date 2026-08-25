"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AstroCompatibilityRequestDto } from "@vedamatch/shared";
import {
  AstroReadingError,
  createAstroCompatibilityRequest,
  generateAstroCompatibilityReading,
  listAstroCompatibilityRequests,
  respondAstroCompatibilityRequest,
} from "@/lib/astro-client-api";
import { birthDataHint } from "./missing-birth-data";

/**
 * Совместимость двух карт. Список запросов — единственный источник состояния;
 * создание запроса и ответ на него просто перечитывают список, а не хранят
 * копию на клиенте — рассинхронизация опаснее лишнего запроса.
 */
export function CompatibilityView({
  autoRequestUserId,
}: {
  autoRequestUserId: string | null;
}) {
  const [requests, setRequests] = useState<AstroCompatibilityRequestDto[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Загрузка используется и из эффектов, и из обработчиков кликов, а линтер
  // требует, чтобы setState в эффекте вызывался только из промис-цепочки прямо
  // внутри его тела — вызов вынесенной именованной функции он не отслеживает.
  // Поэтому эффекты ниже строят цепочку сами, не вызывая refresh() напрямую;
  // refresh() остаётся для обработчиков (там это ограничение не действует).
  async function refresh() {
    try {
      setRequests(await listAstroCompatibilityRequests());
    } catch (cause) {
      setError(
        cause instanceof AstroReadingError ? cause.message : "Не удалось загрузить запросы",
      );
    }
  }

  useEffect(() => {
    let cancelled = false;
    listAstroCompatibilityRequests()
      .then((loaded) => {
        if (!cancelled) setRequests(loaded);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(
            cause instanceof AstroReadingError ? cause.message : "Не удалось загрузить запросы",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autoRequestUserId || requests === null) return undefined;
    const already = requests.some((r) => r.counterpart.userId === autoRequestUserId);
    if (already) return undefined;

    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (!cancelled) setPendingAction(autoRequestUserId);
      })
      .then(() => createAstroCompatibilityRequest(autoRequestUserId))
      .then(() => listAstroCompatibilityRequests())
      .then((loaded) => {
        if (!cancelled) setRequests(loaded);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(
            cause instanceof AstroReadingError ? cause.message : "Не удалось отправить запрос",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setPendingAction(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRequestUserId, requests !== null]);

  async function respond(id: string, accept: boolean) {
    setPendingAction(id);
    try {
      await respondAstroCompatibilityRequest(id, accept);
      await refresh();
    } catch (cause) {
      setError(cause instanceof AstroReadingError ? cause.message : "Не удалось ответить");
    } finally {
      setPendingAction(null);
    }
  }

  if (requests === null) {
    return error ? (
      <ErrorNote message={error} />
    ) : (
      <p className="text-sm text-black/60 dark:text-white/60">Загрузка…</p>
    );
  }

  const incoming = requests.filter((r) => !r.isRequester && r.status === "pending");
  const accepted = requests.filter((r) => r.status === "accepted");
  const outgoing = requests.filter((r) => r.isRequester && r.status === "pending");

  return (
    <div className="space-y-10">
      {/* Ошибка больше не заменяет собой страницу: чаще всего это «заполните
          данные рождения», и человеку нужны и подсказка, и остальные его
          запросы, а не одна красная строка вместо всего. */}
      {error && <ErrorNote message={error} />}

      {incoming.length > 0 && (
        <section>
          <h2 className="text-lg font-medium">Входящие запросы</h2>
          <ul className="mt-3 space-y-3">
            {incoming.map((request) => (
              <li
                key={request.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-black/10 p-3 dark:border-white/15"
              >
                <span>{request.counterpart.name}</span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={pendingAction === request.id}
                    onClick={() => void respond(request.id, true)}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
                  >
                    Принять
                  </button>
                  <button
                    type="button"
                    disabled={pendingAction === request.id}
                    onClick={() => void respond(request.id, false)}
                    className="rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
                  >
                    Отклонить
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {accepted.length > 0 && (
        <section>
          <h2 className="text-lg font-medium">Совместимость</h2>
          <ul className="mt-3 space-y-6">
            {accepted.map((request) => (
              <AcceptedCompatibility key={request.id} request={request} />
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <h2 className="text-lg font-medium">Ожидают ответа</h2>
          <ul className="mt-3 space-y-2 text-sm text-black/60 dark:text-white/60">
            {outgoing.map((request) => (
              <li key={request.id}>{request.counterpart.name}</li>
            ))}
          </ul>
        </section>
      )}

      {incoming.length === 0 && accepted.length === 0 && outgoing.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Запросов на совместимость пока нет. Отправить их можно с карточки
          участника в Знакомствах.
        </p>
      )}
    </div>
  );
}

function AcceptedCompatibility({ request }: { request: AstroCompatibilityRequestDto }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const score = request.score!;

  async function reveal() {
    if (text || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await generateAstroCompatibilityReading(request.id);
      if (result.text) setText(result.text);
      else if (result.blockedBy === "quota_exhausted") {
        setError("Дневная квота разборов исчерпана — очки совместимости выше по-прежнему видны.");
      } else {
        setError("Разбор временно недоступен — очки совместимости выше по-прежнему видны.");
      }
    } catch (cause) {
      setError(cause instanceof AstroReadingError ? cause.message : "Не удалось получить разбор");
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="rounded-xl border border-black/10 p-4 dark:border-white/15">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-medium">{request.counterpart.name}</span>
        <span className="tabular-nums text-black/60 dark:text-white/60">
          {score.totalPoints} из {score.maxPoints} ({score.percent}%)
        </span>
      </div>

      <ul className="mt-3 space-y-1 text-sm">
        {score.kootas.map((koota) => (
          <li key={koota.key} className="flex items-center justify-between gap-4">
            <span className="text-black/70 dark:text-white/70">{koota.title}</span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                <span
                  className="block h-full bg-amber-500"
                  style={{ width: `${(koota.points / koota.maxPoints) * 100}%` }}
                />
              </span>
              <span className="w-10 text-right tabular-nums text-black/60 dark:text-white/60">
                {koota.points}/{koota.maxPoints}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3">
        {text ? (
          <p className="text-sm leading-relaxed whitespace-pre-line">{text}</p>
        ) : (
          <button
            type="button"
            onClick={() => void reveal()}
            disabled={loading}
            className="text-sm underline underline-offset-4 disabled:opacity-50"
          >
            {loading ? "Готовим разбор…" : "Прочитать разбор"}
          </button>
        )}
        {error && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      </div>
    </li>
  );
}

/**
 * Ошибка с выходом. Когда дело в незаполненных данных рождения — а это самый
 * частый случай, особенно у пришедших из Знакомств, — рядом стоит ссылка,
 * куда идти. На прочих сбоях действия нет намеренно: кнопка, не решающая
 * проблему, хуже её отсутствия.
 */
function ErrorNote({ message }: { message: string }) {
  const hint = birthDataHint(message);

  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
      <p className="text-sm text-red-700 dark:text-red-400">{message}</p>
      {hint && (
        <>
          <p className="mt-2 text-sm text-black/70 dark:text-white/70">
            {hint.text}
          </p>
          <Link
            href={hint.href}
            className="mt-3 inline-block rounded-lg bg-magenta px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            {hint.action}
          </Link>
        </>
      )}
    </div>
  );
}
