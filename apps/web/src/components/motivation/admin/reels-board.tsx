"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  MotivationAdminReelDto,
  MotivationAdminReelFilter,
  MotivationAdminReelsResponse,
  MotivationAiStatsDto,
  MotivationReelStage,
} from "@vedamatch/shared";
import { apiRequest } from "../motivation-admin-api";
import { badgeClass, cardClass, dangerButton, primaryButton, secondaryButton } from "./ui";
import { AuthorPolicyForm } from "./author-policy-form";

const FILTERS: Array<{ key: MotivationAdminReelFilter; label: string }> = [
  { key: "all", label: "Все" },
  { key: "waiting", label: "Ждут решения" },
  { key: "rejected", label: "Отклонённые" },
  { key: "appealed", label: "Обжалованные" },
  { key: "published", label: "Опубликованные" },
];

const stageLabels: Record<MotivationReelStage, string> = {
  ai_review: "Проверка ИИ",
  admin_review: "Ждёт вас",
  rejected: "Отклонён",
  generating: "Генерация",
  image_review: "Кадр на проверке",
  published: "Опубликован",
  failed: "Сбой",
};

const aiActionLabels: Record<string, string> = {
  ai_suggest: "подсказка",
  ai_escalate: "эскалация",
  ai_approve: "одобрил",
  ai_reject: "отклонил",
  ai_error: "сбой модели",
  ai_publish: "опубликовал",
};

/**
 * Вкладка «Рилсы участников»: что принесли люди, что решил ИИ и что с этим
 * может сделать администратор-оператор. Решения ИИ не прячутся: рядом с каждым
 * — уверенность и флаги, чтобы было видно, почему модель так решила.
 */
export function ReelsBoard({
  data,
  filter,
}: {
  data: MotivationAdminReelsResponse | null;
  filter: MotivationAdminReelFilter;
}) {
  if (!data) return <p className="text-sm text-text-2">Не удалось загрузить рилсы участников.</p>;

  return (
    <div className="grid gap-4">
      <AiStats stats={data.stats} />
      <nav className="flex flex-wrap gap-1.5" aria-label="Фильтр рилсов">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/motivation/reels${item.key === "all" ? "" : `?filter=${item.key}`}`}
            aria-current={item.key === filter ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              item.key === filter
                ? "border-cyan/40 bg-cyan/10 text-cyan"
                : "border-glass-brd text-text-2 hover:text-text-0"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {data.items.length === 0 ? (
        <p className={`${cardClass} text-sm text-text-1`}>
          Здесь пока пусто. Рилсы появятся, когда участники начнут их создавать.
        </p>
      ) : (
        <ul className="grid gap-3">
          {data.items.map((reel) => (
            <li key={reel.id}>
              <ReelCard reel={reel} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AiStats({ stats }: { stats: MotivationAiStatsDto }) {
  const cells: Array<{ label: string; value: number; tone?: string }> = [
    { label: "проверок", value: stats.checked },
    { label: "одобрено", value: stats.approved, tone: "text-cyan" },
    { label: "отклонено", value: stats.rejected, tone: "text-magenta" },
    { label: "эскалировано", value: stats.escalated, tone: "text-gold" },
    { label: "сбоев модели", value: stats.errors },
    { label: "отменено вами", value: stats.overridden, tone: "text-gold" },
  ];
  return (
    <section className={cardClass} aria-label="Решения ИИ за сегодня">
      <h2 className="mb-3 font-display text-lg font-semibold text-text-0">Решения ИИ · сегодня</h2>
      <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-xl border border-glass-brd bg-bg-0/40 px-3 py-2">
            <dd className={`font-mono text-lg ${cell.tone ?? "text-text-0"}`}>{cell.value}</dd>
            <dt className="text-[11px] text-text-2">{cell.label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-text-2">
        Доля отменённых решений — главный показатель: если она растёт, стоит поправить пороги или
        правила редакции в настройках.
      </p>
    </section>
  );
}

function ReelCard({ reel }: { reel: MotivationAdminReelDto }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);

  async function run(action: string, request: () => Promise<unknown>) {
    setPending(action);
    setError(null);
    try {
      await request();
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не получилось");
    } finally {
      setPending(null);
    }
  }

  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={badgeClass}>{stageLabels[reel.stage]}</span>
            <span className="text-sm font-semibold text-text-0">{reel.authorName ?? "автор удалён"}</span>
            {reel.authorPolicy?.trusted && (
              <span className="rounded-full border border-cyan/40 px-2 py-0.5 text-[11px] text-cyan">
                доверенный
              </span>
            )}
            {reel.authorPolicy?.blocked && (
              <span className="rounded-full border border-red-400/40 px-2 py-0.5 text-[11px] text-red-400">
                запрет
              </span>
            )}
            {!reel.sourceVerified && (
              <span className="text-xs text-text-2">своя цитата, источник не проверен</span>
            )}
          </div>
          <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-text-1">{reel.quoteText}</p>
        </div>
        {reel.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={reel.imageUrl} alt="" className="h-24 w-20 flex-none rounded-xl object-cover" />
        )}
      </div>

      {reel.aiVerdict && (
        <p className="mt-3 rounded-xl bg-bg-0/50 px-3 py-2 text-xs text-text-1">
          <span className="font-mono font-semibold text-text-0">
            ИИ · {aiActionLabels[reel.aiVerdict.action] ?? reel.aiVerdict.action}
            {reel.aiVerdict.decision ? ` · ${reel.aiVerdict.decision}` : ""}
            {reel.aiVerdict.confidence !== null ? ` · ${reel.aiVerdict.confidence.toFixed(2)}` : ""}
          </span>
          {reel.aiVerdict.flags.length > 0 && (
            <span className="ml-2 text-text-2">флаги: {reel.aiVerdict.flags.join(", ")}</span>
          )}
          {reel.rejectionReason && <span className="mt-1 block text-text-1">{reel.rejectionReason}</span>}
        </p>
      )}

      {reel.appeal && (
        <p className="mt-2 rounded-xl border border-magenta/40 bg-magenta/5 px-3 py-2 text-xs">
          <span className="font-semibold text-magenta">Обращение автора:</span>{" "}
          <span className="text-text-1">{reel.appeal.message}</span>
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {reel.stage === "rejected" && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() =>
              void run("restore", () => apiRequest(`/admin/motivation/reels/${reel.id}/restore`, "POST"))
            }
            className={primaryButton}
          >
            {pending === "restore" ? "Возвращаем…" : "Отменить отказ"}
          </button>
        )}
        {reel.stage === "published" && (
          <>
            <Link href={`/motivation?post=${reel.slug}`} className={secondaryButton}>
              Открыть
            </Link>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => {
                const reason = window.prompt("Причина снятия — её увидит автор");
                if (reason?.trim())
                  void run("hide", () =>
                    apiRequest(`/admin/motivation/reels/${reel.id}/hide`, "POST", { reason }),
                  );
              }}
              className={dangerButton}
            >
              {pending === "hide" ? "Снимаем…" : "Снять с публикации"}
            </button>
          </>
        )}
        {(reel.stage === "admin_review" || reel.stage === "image_review") && (
          <Link href="/admin/motivation/queue" className={secondaryButton}>
            К очереди проверки
          </Link>
        )}
        {reel.authorId && (
          <button
            type="button"
            onClick={() => setPolicyOpen((value) => !value)}
            aria-expanded={policyOpen}
            className={secondaryButton}
          >
            Правила автора
          </button>
        )}
      </div>

      {policyOpen && reel.authorId && (
        <div className="mt-3">
          <AuthorPolicyForm
            userId={reel.authorId}
            authorName={reel.authorName ?? "автор"}
            initial={reel.authorPolicy}
          />
        </div>
      )}
    </article>
  );
}
