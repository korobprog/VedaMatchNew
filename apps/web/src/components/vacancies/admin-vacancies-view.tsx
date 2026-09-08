"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type {
  AdminVacancyOfferDto,
  AdminVacancyReportDto,
  AdminVacancyStatsDto,
  VacancyKind,
  VacancyStatus,
} from "@vedamatch/shared";
import {
  VacanciesApiError,
  actOnAdminVacancyOffer,
  decideAdminVacancyReport,
  getAdminVacancyOffers,
  getAdminVacancyReports,
  getAdminVacancyStats,
} from "@/lib/vacancies-api";
import {
  VACANCY_KIND_CHIPS,
  VACANCY_KIND_ORDER,
  VACANCY_REPORT_REASON_LABELS,
  VACANCY_STATUS_LABELS,
  formatDate,
} from "./vacancy-labels";

const INPUT =
  "rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2";

const STATUS_ORDER: VacancyStatus[] = [
  "published",
  "hidden_by_reports",
  "removed_by_admin",
  "hidden_by_author",
  "closed",
  "expired",
  "draft",
];

/** Раздел «Вакансии» в админке: статистика, жалобы, предложения. */
export function AdminVacanciesView() {
  return (
    <div className="space-y-8">
      <StatsBlock />
      <ReportsBlock />
      <OffersBlock />
    </div>
  );
}

function StatsBlock() {
  const [stats, setStats] = useState<AdminVacancyStatsDto | null>(null);
  useEffect(() => {
    getAdminVacancyStats()
      .then(setStats)
      .catch(() => {
        // Статистика — обзор, без неё раздел работает.
      });
  }, []);
  if (!stats) return null;
  const live = VACANCY_KIND_ORDER.map((kind) => ({
    kind,
    count: stats.liveByKind[kind],
  }));
  return (
    <section aria-labelledby="vacancy-stats">
      <h2 id="vacancy-stats" className="mb-3 font-display text-lg font-semibold text-text-0">
        Сейчас
      </h2>
      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {live.map((item) => (
          <Stat key={item.kind} label={`Живых: ${VACANCY_KIND_CHIPS[item.kind].toLowerCase()}`} value={item.count} />
        ))}
        <Stat label="Откликов всего" value={stats.responsesTotal} />
        <Stat label="Откликов за неделю" value={stats.responsesLastWeek} />
        <Stat label="Открытых жалоб" value={stats.openReports} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl border border-glass-brd px-4 py-3">
      <dt className="text-xs text-text-2">{label}</dt>
      <dd className="font-mono text-xl text-text-0">{value}</dd>
    </div>
  );
}

function ReportsBlock() {
  const [items, setItems] = useState<AdminVacancyReportDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      getAdminVacancyReports("open").then((response) => setItems(response.items)),
    [],
  );

  useEffect(() => {
    let alive = true;
    getAdminVacancyReports("open")
      .then((response) => {
        if (alive) setItems(response.items);
      })
      .catch((e: unknown) => {
        if (alive)
          setError(
            e instanceof VacanciesApiError ? e.message : "Не удалось загрузить",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const decide = async (
    id: string,
    decision: "hide" | "dismiss" | "remove" | "restore",
  ) => {
    setBusyId(id);
    setError(null);
    try {
      await decideAdminVacancyReport(id, { decision });
      await reload();
    } catch (e) {
      setError(e instanceof VacanciesApiError ? e.message : "Не получилось");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby="vacancy-reports">
      <h2 id="vacancy-reports" className="mb-1 font-display text-lg font-semibold text-text-0">
        Жалобы
      </h2>
      <p className="mb-3 text-sm text-text-1">
        Три открытые жалобы скрывают предложение автоматически. «Вернуть в
        ленту» закрывает все жалобы на него разом.
      </p>
      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-text-1">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Загружаем…
        </p>
      ) : items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Открытых жалоб нет.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((report) => (
            <li key={report.id} className="glass rounded-2xl border border-glass-brd p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <Link href={`/vacancies/${report.offerId}`} className="font-medium text-text-0 underline">
                  {report.offerTitle}
                </Link>
                <span className="rounded-full border border-glass-brd px-2 py-0.5 text-xs text-text-1">
                  {VACANCY_REPORT_REASON_LABELS[report.reason]}
                </span>
                <span className="text-xs text-text-2">
                  {VACANCY_KIND_CHIPS[report.offerKind]} · {VACANCY_STATUS_LABELS[report.offerStatus]}
                </span>
              </div>
              {/* Мирские имена: по духовному не понять, кто перед тобой. */}
              <p className="mt-1 text-xs text-text-2">
                пожаловался {report.reporterName} · автор {report.authorName} ·{" "}
                {formatDate(report.createdAt)}
              </p>
              {report.note && <p className="mt-2 text-sm text-text-1">{report.note}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton disabled={busyId === report.id} tone="danger" onClick={() => decide(report.id, "hide")}>
                  Скрыть предложение
                </ActionButton>
                <ActionButton disabled={busyId === report.id} tone="danger" onClick={() => decide(report.id, "remove")}>
                  Снять насовсем
                </ActionButton>
                <ActionButton disabled={busyId === report.id} tone="ok" onClick={() => decide(report.id, "restore")}>
                  Вернуть в ленту
                </ActionButton>
                <ActionButton disabled={busyId === report.id} onClick={() => decide(report.id, "dismiss")}>
                  Жалоба необоснованна
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OffersBlock() {
  const [items, setItems] = useState<AdminVacancyOfferDto[]>([]);
  const [total, setTotal] = useState(0);
  const [kind, setKind] = useState<VacancyKind | "">("");
  const [status, setStatus] = useState<VacancyStatus | "">("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setLoading(true);
      getAdminVacancyOffers({
        kind: kind || undefined,
        status: status || undefined,
        q: query || undefined,
      })
        .then((response) => {
          setItems(response.items);
          setTotal(response.total);
        })
        .catch((e: unknown) =>
          setError(
            e instanceof VacanciesApiError ? e.message : "Не удалось загрузить",
          ),
        )
        .finally(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [kind, status, query]);

  const act = async (id: string, action: "hide" | "restore" | "remove") => {
    setBusyId(id);
    setError(null);
    try {
      const updated = await actOnAdminVacancyOffer(id, {
        action,
        moderatorNote: action === "restore" ? null : note.trim() || null,
      });
      setItems((current) => current.map((item) => (item.id === id ? updated : item)));
      setNoteFor(null);
      setNote("");
    } catch (e) {
      setError(e instanceof VacanciesApiError ? e.message : "Не получилось");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby="vacancy-offers">
      <h2 id="vacancy-offers" className="mb-3 font-display text-lg font-semibold text-text-0">
        Предложения
        <span className="ml-2 font-normal text-text-2">{total}</span>
      </h2>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <select
          value={kind}
          aria-label="Вид"
          onChange={(event) => setKind(event.target.value as VacancyKind | "")}
          className={INPUT}
        >
          <option value="" className="bg-bg-0">Все виды</option>
          {VACANCY_KIND_ORDER.map((value) => (
            <option key={value} value={value} className="bg-bg-0">
              {VACANCY_KIND_CHIPS[value]}
            </option>
          ))}
        </select>
        <select
          value={status}
          aria-label="Статус"
          onChange={(event) => setStatus(event.target.value as VacancyStatus | "")}
          className={INPUT}
        >
          <option value="" className="bg-bg-0">Все статусы</option>
          {STATUS_ORDER.map((value) => (
            <option key={value} value={value} className="bg-bg-0">
              {VACANCY_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Заголовок или автор"
          aria-label="Поиск"
          className={INPUT}
        />
      </div>
      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-text-1">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Загружаем…
        </p>
      ) : items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Ничего не нашлось.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((offer) => (
            <li key={offer.id} className="glass rounded-2xl border border-glass-brd p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xs text-text-2">{VACANCY_KIND_CHIPS[offer.kind]}</span>
                <Link href={`/vacancies/${offer.id}`} className="font-medium text-text-0 underline">
                  {offer.title}
                </Link>
                <span className="text-xs text-text-1">{VACANCY_STATUS_LABELS[offer.status]}</span>
                {offer.openReportsCount > 0 && (
                  <span className="rounded-full border border-red-400/30 px-2 py-0.5 text-xs text-red-400">
                    жалоб: {offer.openReportsCount}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-text-2">
                {offer.communityName ? `община ${offer.communityName} · ` : ""}
                автор {offer.authorName} · {offer.isRemote ? "удалённо" : (offer.city ?? "без города")} ·
                откликов {offer.responsesCount} · до {formatDate(offer.expiresAt)}
              </p>
              {offer.moderatorNote && (
                <p className="mt-1 text-xs text-text-1">Модератор: {offer.moderatorNote}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {noteFor === offer.id ? (
                  <>
                    <input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Причина для автора"
                      aria-label="Причина для автора"
                      className={`${INPUT} min-w-[16rem]`}
                    />
                    <ActionButton disabled={busyId === offer.id} tone="danger" onClick={() => act(offer.id, "hide")}>
                      Скрыть
                    </ActionButton>
                    <ActionButton disabled={busyId === offer.id} tone="danger" onClick={() => act(offer.id, "remove")}>
                      Снять насовсем
                    </ActionButton>
                    <ActionButton onClick={() => setNoteFor(null)}>Отмена</ActionButton>
                  </>
                ) : (
                  <>
                    {offer.status !== "removed_by_admin" && offer.status !== "hidden_by_reports" && (
                      <ActionButton disabled={busyId === offer.id} onClick={() => { setNoteFor(offer.id); setNote(""); }}>
                        Скрыть или снять…
                      </ActionButton>
                    )}
                    {(offer.status === "hidden_by_reports" || offer.status === "removed_by_admin") && (
                      <ActionButton disabled={busyId === offer.id} tone="ok" onClick={() => act(offer.id, "restore")}>
                        Вернуть в ленту
                      </ActionButton>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger" | "ok";
}) {
  const color =
    tone === "danger"
      ? "border-red-400/30 text-red-400"
      : tone === "ok"
        ? "border-emerald-400/40 text-emerald-400"
        : "border-glass-brd text-text-1 hover:text-text-0";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50 ${color}`}
    >
      {children}
    </button>
  );
}
