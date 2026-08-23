import Link from "next/link";
import { UnionAdminTabs } from "@/components/union/admin/admin-tabs";
import { getUnionAdminStats } from "@/lib/union-api";

export const metadata = {
  title: "Знакомства — сводка",
  robots: { index: false, follow: false },
};

export default async function AdminUnionPage() {
  const stats = await getUnionAdminStats();

  return (
    <>
      <UnionAdminTabs active="stats" />

      {!stats ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Сводка недоступна.
        </p>
      ) : (
        <>
          <section aria-labelledby="union-profiles">
            <h2
              id="union-profiles"
              className="mb-3 font-display text-lg font-semibold text-text-0"
            >
              Анкеты
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Tile label="Всего" value={stats.profiles.total} />
              <Tile label="В выдаче" value={stats.profiles.active} />
              <Tile label="Сняты" value={stats.profiles.hidden} />
              <Tile label="Внимание активно" value={stats.boostsActive} />
            </div>
            {stats.profiles.hidden > 0 && (
              <p className="mt-2 text-sm text-text-1">
                <Link
                  href="/admin/union/profiles?visibility=hidden"
                  className="underline underline-offset-2 hover:text-text-0"
                >
                  Посмотреть снятые анкеты
                </Link>
              </p>
            )}
          </section>

          <section className="mt-8" aria-labelledby="union-week">
            <h2
              id="union-week"
              className="mb-3 font-display text-lg font-semibold text-text-0"
            >
              За последние 7 дней
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Просмотров колоды" value={stats.week.swipes} />
              <Tile label="Из них симпатий" value={stats.week.likes} />
              <Tile label="Заявок" value={stats.week.requests} />
            </div>
          </section>

          <section className="mt-8" aria-labelledby="union-matches">
            <h2
              id="union-matches"
              className="mb-3 font-display text-lg font-semibold text-text-0"
            >
              Знакомства
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Состоялось" value={stats.matches.total} />
              <Tile label="Ждут ответа" value={stats.matches.pending} />
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl border border-glass-brd p-4">
      <p className="font-mono text-2xl font-semibold text-text-0">{value}</p>
      <p className="mt-1 text-sm text-text-1">{label}</p>
    </div>
  );
}
