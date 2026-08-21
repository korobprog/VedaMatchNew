import Link from "next/link";
import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { cardClass } from "@/components/motivation/admin/ui";
import { getAdminMotivationAnalytics } from "@/lib/motivation-api";

/** Сводка сервиса: лента, участники и расход за окно в днях. */
export default async function AdminMotivationAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = [7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 7;
  const data = await getAdminMotivationAnalytics(days);

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Что происходит в ленте и во что обходится генерация. Расход разделён: редакционные посты и
        рилсы участников оплачиваются из одного бюджета, но считать их вместе бессмысленно.
      </p>
      <MotivationAdminTabs active="analytics" />
      <nav className="mb-4 flex gap-1.5" aria-label="Период">
        {[7, 30, 90].map((value) => (
          <Link
            key={value}
            href={`/admin/motivation/analytics?days=${value}`}
            aria-current={value === days ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              value === days
                ? "border-cyan/40 bg-cyan/10 text-cyan"
                : "border-glass-brd text-text-2 hover:text-text-0"
            }`}
          >
            {value} дней
          </Link>
        ))}
      </nav>
      {!data ? (
        <p className={`${cardClass} text-sm text-text-1`}>Не удалось загрузить сводку.</p>
      ) : (
        <div className="grid gap-4">
          <section className={cardClass}>
            <h2 className="mb-3 font-display text-lg font-semibold text-text-0">Лента</h2>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Cell label="просмотров" value={data.views} />
              <Cell label="лайков" value={data.likes} />
              <Cell label="сохранений" value={data.favorites} />
              <Cell label="опубликовано" value={data.publishedTotal} />
            </dl>
          </section>
          <section className={cardClass}>
            <h2 className="mb-3 font-display text-lg font-semibold text-text-0">Участники</h2>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Cell label="создано рилсов" value={data.userReels} />
              <Cell label="опубликовано" value={data.userPublished} />
              <Cell label="отклонено" value={data.userRejected} />
              <Cell
                label="доля отказов"
                value={data.userReels ? `${Math.round((data.userRejected / data.userReels) * 100)}%` : "—"}
              />
            </dl>
          </section>
          <section className={cardClass}>
            <h2 className="mb-3 font-display text-lg font-semibold text-text-0">Расход, $</h2>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Cell label="редакция" value={data.editorialCostUsd.toFixed(2)} />
              <Cell label="участники" value={data.userCostUsd.toFixed(2)} />
              <Cell
                label="всего"
                value={(data.editorialCostUsd + data.userCostUsd).toFixed(2)}
              />
            </dl>
          </section>
          <section className={cardClass}>
            <h2 className="mb-3 font-display text-lg font-semibold text-text-0">Топ по лайкам</h2>
            <ul className="grid gap-2">
              {data.top.map((post) => (
                <li key={post.id} className="flex items-center gap-3 text-sm">
                  <span className="font-mono text-text-0">{post.likeCount}</span>
                  <Link href={`/motivation?post=${post.slug}`} className="truncate text-text-1 hover:text-text-0">
                    {post.title}
                  </Link>
                  {post.origin === "user" && <span className="text-xs text-cyan">участник</span>}
                </li>
              ))}
              {data.top.length === 0 && <li className="text-sm text-text-2">Пока нечего показать.</li>}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}

function Cell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-glass-brd bg-bg-0/40 px-3 py-2">
      <dd className="font-mono text-lg text-text-0">{value}</dd>
      <dt className="text-[11px] text-text-2">{label}</dt>
    </div>
  );
}
