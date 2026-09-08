"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Briefcase,
  CalendarClock,
  Globe,
  Loader2,
  MapPin,
  Send,
} from "lucide-react";
import type { VacancyOfferDto } from "@vedamatch/shared";
import {
  VacanciesApiError,
  deleteVacancy,
  getVacanciesFeed,
  getVacancy,
  renewVacancy,
  respondToVacancy,
  setVacancyStatus,
  withdrawVacancyResponse,
} from "@/lib/vacancies-api";
import { VacancyCard } from "./vacancy-card";
import {
  VACANCY_AUDIENCE_LABELS,
  VACANCY_EMPLOYMENT_LABELS,
  VACANCY_KIND_CHIP_STYLE,
  VACANCY_KIND_LABELS,
  VACANCY_PERK_LABELS,
  VACANCY_RESPONSE_STATUS_LABELS,
  VACANCY_SEVA_TERM_LABELS,
  VACANCY_STATUS_LABELS,
  VACANCY_WORK_FORMAT_LABELS,
  formatDate,
  formatExpiry,
  formatPay,
} from "./vacancy-labels";
import { VacancyReportDialog } from "./vacancy-report-dialog";
import { buildVacancyShareHref } from "./vacancy-share";

export function VacancyDetailView({ id }: { id: string }) {
  const router = useRouter();
  const [offer, setOffer] = useState<VacancyOfferDto | null>(null);
  const [similar, setSimilar] = useState<VacancyOfferDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [responding, setResponding] = useState(false);
  const [message, setMessage] = useState("");

  // Момент открытия карточки: «срок вышел» считается от него, а не от
  // каждого рендера — Date.now() при рендере запрещён правилами React.
  const [openedAt] = useState(() => Date.now());

  const fetchOffer = useCallback(
    () =>
      getVacancy(id)
        .then(setOffer)
        .catch((e: unknown) => {
          if (e instanceof VacanciesApiError && e.status === 404)
            setNotFound(true);
          else setError(e instanceof VacanciesApiError ? e.message : "Ошибка");
        })
        .finally(() => setLoading(false)),
    [id],
  );

  useEffect(() => {
    void fetchOffer();
  }, [fetchOffer]);

  const retry = () => {
    setError(null);
    setLoading(true);
    void fetchOffer();
  };

  // Похожие: тот же вид, живые, кроме этого. Без отдельного эндпоинта —
  // лента с фильтром по виду это и есть.
  useEffect(() => {
    if (!offer || offer.status !== "published") return;
    const controller = new AbortController();
    getVacanciesFeed({ kind: offer.kind, limit: 4 }, controller.signal)
      .then((response) =>
        setSimilar(response.items.filter((item) => item.id !== offer.id).slice(0, 3)),
      )
      .catch(() => {
        // Похожие — украшение, без них карточка целая.
      });
    return () => controller.abort();
  }, [offer]);

  const act = useCallback(
    async (action: () => Promise<VacancyOfferDto | void>) => {
      setBusy(true);
      setError(null);
      try {
        const updated = await action();
        if (updated) setOffer(updated);
      } catch (e) {
        setError(e instanceof VacanciesApiError ? e.message : "Не получилось");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const respond = async () => {
    if (!offer) return;
    // Кнопка меняется сразу, при ошибке возвращается: ждать ответа сервера,
    // глядя на неподвижную кнопку, — лишняя секунда сомнения.
    const before = offer;
    setOffer({
      ...offer,
      myResponse: { id: "pending", status: "new" },
      responsesCount: offer.responsesCount + 1,
    });
    setResponding(false);
    try {
      const response = await respondToVacancy(offer.id, {
        message: message.trim() || null,
      });
      setOffer((current) =>
        current
          ? { ...current, myResponse: { id: response.id, status: response.status } }
          : current,
      );
      setMessage("");
    } catch (e) {
      setOffer(before);
      setError(e instanceof VacanciesApiError ? e.message : "Не получилось");
    }
  };

  if (loading)
    return (
      <p className="flex items-center gap-2 text-sm text-text-1">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Загружаем…
      </p>
    );

  if (notFound)
    return (
      <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        <p>Предложение не найдено — возможно, его сняли или срок вышел.</p>
        <Link href="/vacancies" className="mt-2 inline-block text-text-0 underline">
          Вернуться в ленту
        </Link>
      </div>
    );

  if (!offer)
    return (
      <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        <p role="alert" className="text-red-500">
          {error ?? "Не удалось загрузить предложение"}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={retry}
            className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Повторить
          </button>
          <Link href="/vacancies" className="self-center text-text-0 underline">
            Вернуться в ленту
          </Link>
        </div>
      </div>
    );

  const live = offer.status === "published";
  const expired = new Date(offer.expiresAt).getTime() < openedAt;
  const pay = formatPay(offer.pay);

  return (
    <div className="space-y-6">
      {(!live || expired) && (
        <p className="rounded-xl border border-glass-brd bg-glass px-4 py-3 text-sm text-text-1">
          {expired && live ? "Срок вышел" : VACANCY_STATUS_LABELS[offer.status]}
          {offer.isMine && offer.canRenew && " — продлите, если ещё актуально."}
          {offer.isMine && offer.moderatorNote && (
            <span className="mt-1 block text-text-2">
              Причина: {offer.moderatorNote}.{" "}
              <Link href="/notices/rules" className="underline">
                Правила
              </Link>
            </span>
          )}
        </p>
      )}

      <article className="glass rounded-2xl border border-glass-brd p-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${VACANCY_KIND_CHIP_STYLE[offer.kind]}`}
          >
            {VACANCY_KIND_LABELS[offer.kind]}
          </span>
          {live && !expired && (
            <span className="text-xs text-text-2">{formatExpiry(offer.expiresAt)}</span>
          )}
        </div>
        <h1 className="font-display text-2xl font-bold text-text-0">{offer.title}</h1>

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {offer.kind === "work" && (
            <>
              {pay && <Term label="Оплата">{pay}</Term>}
              {offer.workFormat && (
                <Term label="Формат">{VACANCY_WORK_FORMAT_LABELS[offer.workFormat]}</Term>
              )}
              {offer.employment && (
                <Term label="Занятость">{VACANCY_EMPLOYMENT_LABELS[offer.employment]}</Term>
              )}
              {offer.schedule && <Term label="График">{offer.schedule}</Term>}
            </>
          )}
          {offer.kind === "seva" && (
            <>
              {offer.sevaTerm && (
                <Term label="Срок">
                  {VACANCY_SEVA_TERM_LABELS[offer.sevaTerm]}
                  {offer.sevaUntil && ` · до ${formatDate(offer.sevaUntil)}`}
                </Term>
              )}
              {offer.perks.length > 0 && (
                <Term label="Предоставляют">
                  {offer.perks.map((perk) => VACANCY_PERK_LABELS[perk]).join(", ")}
                </Term>
              )}
            </>
          )}
          {offer.kind === "task" && offer.dueAt && (
            <Term label="Срок">
              <span className="flex items-center gap-1.5">
                <CalendarClock className="size-4" aria-hidden />
                {formatDate(offer.dueAt)}
              </span>
            </Term>
          )}
          <Term label="Где">
            <span className="flex items-center gap-1.5">
              {offer.isRemote ? (
                <>
                  <Globe className="size-4" aria-hidden />
                  {offer.city ? `Удалённо · ${offer.city}` : "Удалённо, из любого города"}
                </>
              ) : (
                <>
                  <MapPin className="size-4" aria-hidden />
                  {offer.city ?? "Город не указан"}
                </>
              )}
            </span>
          </Term>
        </dl>

        {offer.description && (
          <p className="mt-4 whitespace-pre-line text-sm text-text-1">{offer.description}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-glass-brd pt-4 text-sm text-text-2">
          <Briefcase className="size-4" aria-hidden />
          <span>{offer.postedAs ? "Зовёт община" : "Зовёт"}</span>
          {offer.postedAs ? (
            <Link
              href={`/communities/${offer.postedAs.slug}`}
              className="flex items-center gap-1 text-text-1 underline"
            >
              {offer.postedAs.isVerified && (
                <BadgeCheck className="size-4 text-emerald-400" aria-hidden />
              )}
              {offer.postedAs.name}
            </Link>
          ) : (
            <Link href={`/profile/${offer.author.userId}`} className="text-text-1 underline">
              {offer.author.name}
            </Link>
          )}
          <span>· {formatDate(offer.publishedAt)}</span>
          {offer.responsesCount > 0 && <span>· откликов: {offer.responsesCount}</span>}
        </div>

        {/* Одна главная кнопка по состоянию. */}
        {!offer.isMine && live && !expired && (
          <div className="mt-4">
            {offer.myResponse && offer.myResponse.status !== "withdrawn" ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm text-text-0">
                  Вы откликнулись · {VACANCY_RESPONSE_STATUS_LABELS[offer.myResponse.status]}
                </span>
                <Link href="/vacancies/responses" className="text-sm text-text-1 underline">
                  Мои отклики
                </Link>
                {offer.myResponse.status === "new" && offer.myResponse.id !== "pending" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await withdrawVacancyResponse(offer.myResponse!.id);
                        return getVacancy(offer.id);
                      })
                    }
                    className="text-sm text-text-2 underline disabled:opacity-50"
                  >
                    Отозвать
                  </button>
                )}
              </div>
            ) : responding ? (
              <div className="rounded-xl border border-glass-brd p-4">
                <label htmlFor="vacancy-response" className="mb-2 block text-sm font-medium text-text-1">
                  Пара слов о себе
                </label>
                <textarea
                  id="vacancy-response"
                  rows={3}
                  maxLength={1000}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Чем занимались, когда можете начать"
                  className="w-full rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void respond()}
                    className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-medium text-white"
                  >
                    Отправить отклик
                  </button>
                  <button
                    type="button"
                    onClick={() => setResponding(false)}
                    className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1"
                  >
                    Отмена
                  </button>
                </div>
                <p className="mt-2 text-xs text-text-2">
                  Автор увидит ваш профиль и это сообщение. Резюме не нужно.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setResponding(true)}
                className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-5 py-2.5 text-sm font-medium text-white"
              >
                Откликнуться
              </button>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-glass-brd pt-4">
          {/* Живое предложение можно переслать другу: «тебе не подойдёт?».
              Экран отправки общий у портала, свой список бесед не нужен. */}
          {live && !expired && (
            <Link
              href={buildVacancyShareHref(offer)}
              className="flex items-center gap-1 text-xs text-text-1 underline hover:text-text-0"
            >
              <Send className="size-3.5" aria-hidden />
              Отправить в чат
            </Link>
          )}
          {!offer.isMine && <VacancyReportDialog offerId={offer.id} />}
        </div>
      </article>

      {error && (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {offer.isMine && (
        <div className="glass rounded-2xl border border-glass-brd p-6">
          <h2 className="mb-1 font-display text-lg font-semibold text-text-0">
            Ваше предложение
          </h2>
          <p className="mb-4 text-sm text-text-2">
            Видно: {VACANCY_AUDIENCE_LABELS[offer.audience]}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/vacancies/${offer.id}/responses`}
              className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-medium text-white"
            >
              Отклики ({offer.responsesCount})
            </Link>
            <Link
              href={`/vacancies/${offer.id}/edit`}
              className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
            >
              Редактировать
            </Link>
            {offer.canRenew && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => renewVacancy(offer.id))}
                className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
              >
                Продлить
              </button>
            )}
            {live && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => setVacancyStatus(offer.id, { status: "closed" }))}
                  className="rounded-xl border border-emerald-400/40 px-4 py-2 text-sm text-emerald-400 disabled:opacity-50"
                >
                  Человек найден
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(() => setVacancyStatus(offer.id, { status: "hidden_by_author" }))
                  }
                  className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
                >
                  Скрыть
                </button>
              </>
            )}
            {(offer.status === "hidden_by_author" || offer.status === "closed" || offer.status === "expired") && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => setVacancyStatus(offer.id, { status: "published" }))}
                className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
              >
                Опубликовать снова
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await deleteVacancy(offer.id);
                  router.push("/vacancies/mine");
                })
              }
              className="ml-auto rounded-xl border border-red-400/30 px-4 py-2 text-sm text-red-400 disabled:opacity-50"
            >
              Удалить
            </button>
          </div>
        </div>
      )}

      {similar.length > 0 && (
        <section aria-labelledby="similar-heading">
          <h2 id="similar-heading" className="mb-3 font-display text-lg font-semibold text-text-0">
            Похожие предложения
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {similar.map((item) => (
              <li key={item.id}>
                <VacancyCard offer={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-2">{label}</dt>
      <dd className="text-text-1">{children}</dd>
    </div>
  );
}
