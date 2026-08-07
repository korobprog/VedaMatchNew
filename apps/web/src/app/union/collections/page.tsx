import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { UnionNav } from "@/components/union/union-nav";
import { UnionTabBar } from "@/components/union/union-tabbar";
import { UnionTopBar } from "@/components/union/union-top-bar";
import { getProfile } from "@/lib/api";
import {
  getUnionChats,
  getUnionConnectionCounts,
} from "@/lib/union-api";
import { hasCompleteUnionLocation } from "@/lib/union-location";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

/**
 * Подборки — готовые наборы фильтров поверх обычных рекомендаций. Отдельной
 * логики выдачи нет: каждая карточка ведёт в /union/recommendations с query.
 */
const collections: {
  title: string;
  description: string;
  query: string;
  accent: string;
}[] = [
  {
    title: "Рядом",
    description: "Те, кто живёт не дальше 50 км от вас",
    query: "radiusKm=50",
    accent: "from-cyan/25 to-cyan/5",
  },
  {
    title: "Новые",
    description: "Анкеты, появившиеся недавно",
    query: "sort=new",
    accent: "from-cyan/20 to-[#B23EFF]/10",
  },
  {
    title: "Высокая совместимость",
    description: "Совпадение по целям и ценностям от 70%",
    query: "minScore=70",
    accent: "from-magenta/25 to-cyan/10",
  },
  {
    title: "Подтверждённые преданные",
    description: "Статус проверен администрацией",
    query: "verifiedOnly=true",
    accent: "from-magenta/25 to-magenta/5",
  },
  {
    title: "С проверенными фото",
    description: "Фото сверены с живым человеком",
    query: "photoVerifiedOnly=true",
    accent: "from-[#B23EFF]/25 to-[#B23EFF]/5",
  },
  {
    title: "Создание семьи",
    description: "Главный приоритет анкеты — семья",
    query: "intention=family",
    accent: "from-magenta/25 to-[#B23EFF]/10",
  },
  {
    title: "Совместное служение",
    description: "Ищут единомышленников в служении",
    query: "intention=service",
    accent: "from-cyan/25 to-[#B23EFF]/10",
  },
  {
    title: "Дружба по интересам",
    description: "Общение и общие увлечения",
    query: "intention=friendship",
    accent: "from-[#B23EFF]/25 to-cyan/10",
  },
  {
    title: "Бизнес и проекты",
    description: "Партнёрство и совместные дела",
    query: "intention=business",
    accent: "from-cyan/20 to-magenta/10",
  },
];

export default async function UnionCollectionsPage() {
  const user = await getProfile();
  if (!user) redirect("/login");
  if (!hasCompleteUnionLocation(user)) redirect("/union/location");

  const [counts, chats] = await Promise.all([
    getUnionConnectionCounts().catch(() => null),
    getUnionChats().catch(() => null),
  ]);

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 pb-28">
        <UnionTopBar title="Подборки" />
        <div className="mb-6 hidden md:block">
          <h1 className="font-display text-2xl font-bold text-text-0">
            Подборки
          </h1>
          <p className="mt-1 text-sm text-text-1">
            Готовые наборы фильтров — быстрый способ посмотреть анкеты под
            конкретный запрос.
          </p>
        </div>
        <UnionNav incomingPending={counts?.incomingPending ?? 0} />

        <div className="grid gap-4 sm:grid-cols-2">
          {collections.map((collection) => (
            <Link
              key={collection.title}
              href={`/union/recommendations?${collection.query}`}
              className="glass group relative overflow-hidden rounded-3xl border border-glass-brd p-5 transition hover:border-magenta/30"
            >
              <span
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${collection.accent} opacity-70 transition group-hover:opacity-100`}
              />
              <span className="relative block font-display text-lg font-bold text-text-0">
                {collection.title}
              </span>
              <span className="relative mt-1 block text-sm text-text-1">
                {collection.description}
              </span>
            </Link>
          ))}
        </div>
      </main>
      <UnionTabBar
        incomingPending={counts?.incomingPending ?? 0}
        hasUnreadChats={(chats?.unreadTotal ?? 0) > 0}
      />
    </div>
  );
}
