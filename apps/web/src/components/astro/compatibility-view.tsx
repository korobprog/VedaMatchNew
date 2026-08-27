"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  AstroCompatibilityPurpose,
  AstroCompatibilityRequestDto,
} from "@vedamatch/shared";
import {
  ASTRO_COMPATIBILITY_PURPOSES,
  ASTRO_PURPOSE_TITLES,
} from "@vedamatch/shared";
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
  presetPurpose = null,
}: {
  autoRequestUserId: string | null;
  /**
   * Цель, выбранная ещё в карточке Знакомств. Она не отправляет запрос сама:
   * человек уже нажал на неё в меню, но подтверждение остаётся здесь — из
   * адресной строки нельзя понять, дошёл ли он сюда осознанно.
   */
  presetPurpose?: AstroCompatibilityPurpose | null;
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

  /**
   * Запрос по ссылке из Знакомств отправляется не сам, а после выбора цели.
   *
   * Цель знает только отправитель: сверяют карты ради семьи, дела, дружбы или
   * служения, и от этого зависит, какие куты вообще считать. Заодно уходит
   * прежнее поведение, при котором переход по ссылке слал запрос живому
   * человеку, ни о чём не спросив.
   */
  async function send(purpose: AstroCompatibilityPurpose) {
    if (!autoRequestUserId) return;
    setPendingAction(autoRequestUserId);
    try {
      await createAstroCompatibilityRequest(autoRequestUserId, purpose);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof AstroReadingError
          ? cause.message
          : "Не удалось отправить запрос",
      );
    } finally {
      setPendingAction(null);
    }
  }

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
      <p className="text-sm text-text-2">Загрузка…</p>
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

      {/* Пришли по ссылке с карточки участника, и запроса к нему ещё нет */}
      {autoRequestUserId &&
        !requests.some((r) => r.counterpart.userId === autoRequestUserId) && (
          <section className="rounded-xl border border-glass-brd p-4">
            <h2 className="text-lg font-medium">Ради чего сверяем карты?</h2>
            <p className="mt-1 text-sm text-text-2">
              От цели зависит, какие куты идут в расчёт: сватовской гуна-милан
              считает все восемь, делу и служению часть из них отвечает не на
              тот вопрос.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ASTRO_COMPATIBILITY_PURPOSES.map((purpose) => (
                <button
                  key={purpose}
                  type="button"
                  disabled={pendingAction === autoRequestUserId}
                  onClick={() => void send(purpose)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
                    purpose === presetPurpose
                      ? "border-mint-edge font-medium"
                      : "border-glass-brd hover:border-mint-edge"
                  }`}
                >
                  {ASTRO_PURPOSE_TITLES[purpose]}
                  {purpose === presetPurpose && (
                    <span className="ml-1.5 font-mono text-xs text-text-2">
                      из Знакомств
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

      {incoming.length > 0 && (
        <section>
          <h2 className="text-lg font-medium">Входящие запросы</h2>
          <ul className="mt-3 space-y-3">
            {incoming.map((request) => (
              <li
                key={request.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-glass-brd p-3"
              >
                <span>{request.counterpart.name}</span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={pendingAction === request.id}
                    onClick={() => void respond(request.id, true)}
                    className="rounded-lg btn-mint px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  >
                    Принять
                  </button>
                  <button
                    type="button"
                    disabled={pendingAction === request.id}
                    onClick={() => void respond(request.id, false)}
                    className="rounded-lg border border-glass-brd px-3 py-1.5 text-sm"
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
          <ul className="mt-3 space-y-2 text-sm text-text-2">
            {outgoing.map((request) => (
              <li key={request.id}>{request.counterpart.name}</li>
            ))}
          </ul>
        </section>
      )}

      {incoming.length === 0 && accepted.length === 0 && outgoing.length === 0 && (
        <p className="text-sm text-text-2">
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
    <li className="rounded-xl border border-glass-brd p-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-medium">{request.counterpart.name}</span>
        <span className="tabular-nums text-text-2">
          {score.totalPoints} из {score.maxPoints} ({score.percent}%)
        </span>
      </div>

      <ul className="mt-3 space-y-1 text-sm">
        {score.kootas.map((koota) => (
          <li key={koota.key} className="flex items-center justify-between gap-4">
            <span className="text-text-1">{koota.title}</span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-2">
                <span
                  className="block h-full bg-gold"
                  style={{ width: `${(koota.points / koota.maxPoints) * 100}%` }}
                />
              </span>
              <span className="w-10 text-right tabular-nums text-text-2">
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
        {error && <p className="mt-2 text-sm text-magenta">{error}</p>}
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
    <div className="rounded-xl border border-magenta/40 bg-magenta/5 p-4">
      <p className="text-sm text-magenta">{message}</p>
      {hint && (
        <>
          <p className="mt-2 text-sm text-text-1">
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
