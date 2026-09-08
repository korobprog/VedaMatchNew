"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { VacancyOfferDto, VacancyResponseDto } from "@vedamatch/shared";
import {
  VacanciesApiError,
  getVacancy,
  getVacancyResponses,
  setVacancyResponseStatus,
  setVacancyStatus,
} from "@/lib/vacancies-api";
import {
  FUNNEL_COLUMNS,
  buildFunnel,
  funnelActions,
  moveInFunnel,
  type FunnelColumn,
} from "./vacancy-funnel";
import { formatDate } from "./vacancy-labels";

/**
 * Воронка откликов автора. Колонки — статусы, действия — кнопками: перенос
 * мышью тут был бы игрушкой, решение по человеку принимают кнопкой с
 * названием, и она же доступна с клавиатуры.
 */
export function VacancyResponsesView({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [offer, setOffer] = useState<VacancyOfferDto | null>(null);
  const [items, setItems] = useState<VacancyResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [offerClose, setOfferClose] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([getVacancy(offerId), getVacancyResponses(offerId)])
      .then(([found, responses]) => {
        if (!alive) return;
        setOffer(found);
        setItems(responses.items);
      })
      .catch((e: unknown) => {
        if (alive)
          setError(
            e instanceof VacanciesApiError && e.status === 404
              ? "Предложение не найдено"
              : "Не удалось загрузить отклики",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [offerId]);

  const decide = useCallback(
    async (response: VacancyResponseDto, status: FunnelColumn) => {
      if (status === "new") return;
      // Карточка уезжает в новую колонку сразу; при ошибке возвращается.
      const before = items;
      setItems(moveInFunnel(items, response.id, status));
      setBusyId(response.id);
      setError(null);
      try {
        const updated = await setVacancyResponseStatus(response.id, { status });
        setItems((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
        if (status === "accepted") setOfferClose(true);
        if (status === "in_dialog")
          router.push(`/chat/with/${response.user.userId}`);
      } catch (e) {
        setItems(before);
        setError(e instanceof VacanciesApiError ? e.message : "Не получилось");
      } finally {
        setBusyId(null);
      }
    },
    [items, router],
  );

  const closeOffer = async () => {
    if (!offer) return;
    setError(null);
    try {
      const updated = await setVacancyStatus(offer.id, { status: "closed" });
      setOffer(updated);
      setOfferClose(false);
    } catch (e) {
      setError(e instanceof VacanciesApiError ? e.message : "Не получилось");
    }
  };

  if (loading)
    return (
      <p className="flex items-center gap-2 text-sm text-text-1">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Загружаем…
      </p>
    );

  if (!offer)
    return (
      <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        <p role="alert">{error ?? "Не удалось загрузить"}</p>
        <Link href="/vacancies/mine" className="mt-2 inline-block text-text-0 underline">
          Мои предложения
        </Link>
      </div>
    );

  const funnel = buildFunnel(items);
  const total = Object.values(funnel).flat().length;

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-glass-brd p-4">
        <p className="text-xs text-text-2">Отклики на</p>
        <Link href={`/vacancies/${offer.id}`} className="font-medium text-text-0 underline">
          {offer.title}
        </Link>
        {offer.status === "closed" && (
          <p className="mt-1 text-xs text-text-2">Предложение закрыто: человек найден.</p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {offerClose && offer.status === "published" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-text-0">
          Отклик принят. Закрыть предложение, чтобы остальные не ждали?
          <button
            type="button"
            onClick={() => void closeOffer()}
            className="rounded-lg border border-emerald-400/40 px-3 py-1 text-emerald-400"
          >
            Закрыть предложение
          </button>
          <button
            type="button"
            onClick={() => setOfferClose(false)}
            className="text-text-2 underline"
          >
            Пока нет
          </button>
        </div>
      )}

      {total === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Откликов пока нет. Когда кто-то откликнется, вы получите уведомление.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {FUNNEL_COLUMNS.map((column) => (
            <section
              key={column.key}
              aria-labelledby={`funnel-${column.key}`}
              className="glass rounded-2xl border border-glass-brd p-4"
            >
              <h2 id={`funnel-${column.key}`} className="mb-1 text-sm font-semibold text-text-0">
                {column.title}
                <span className="ml-2 font-normal text-text-2">{funnel[column.key].length}</span>
              </h2>
              <p className="mb-3 text-xs text-text-2">{column.note}</p>
              {funnel[column.key].length === 0 ? (
                <p className="text-xs text-text-2">Пусто</p>
              ) : (
                <ul className="space-y-2">
                  {funnel[column.key].map((response) => (
                    <ResponseCard
                      key={response.id}
                      response={response}
                      busy={busyId === response.id}
                      onDecide={(status) => void decide(response, status)}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ResponseCard({
  response,
  busy,
  onDecide,
}: {
  response: VacancyResponseDto;
  busy: boolean;
  onDecide: (status: FunnelColumn) => void;
}) {
  const actions = funnelActions(response.status);
  return (
    <li className="rounded-xl border border-glass-brd p-3">
      <div className="flex items-center gap-2">
        {response.user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={response.user.avatarUrl}
            alt=""
            className="size-8 rounded-full object-cover"
          />
        ) : (
          <span aria-hidden className="size-8 rounded-full bg-glass" />
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/profile/${response.user.userId}`}
            className="block truncate text-sm font-medium text-text-0 underline"
          >
            {response.user.name}
          </Link>
          <p className="text-xs text-text-2">
            {response.user.city ? `${response.user.city} · ` : ""}
            {formatDate(response.createdAt)}
          </p>
        </div>
      </div>
      {response.message && (
        <p className="mt-2 whitespace-pre-line text-sm text-text-1">{response.message}</p>
      )}
      {(actions.dialog || actions.accept || actions.decline) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.dialog && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide("in_dialog")}
              className="rounded-lg border border-glass-brd px-3 py-1 text-xs text-text-1 hover:text-text-0 disabled:opacity-50"
            >
              Открыть диалог
            </button>
          )}
          {actions.accept && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide("accepted")}
              className="rounded-lg border border-emerald-400/40 px-3 py-1 text-xs text-emerald-400 disabled:opacity-50"
            >
              Принять
            </button>
          )}
          {actions.decline && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide("declined")}
              className="rounded-lg border border-glass-brd px-3 py-1 text-xs text-text-2 hover:text-text-0 disabled:opacity-50"
            >
              Отклонить
            </button>
          )}
        </div>
      )}
    </li>
  );
}
