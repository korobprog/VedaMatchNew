import { PeopleNav } from "@/components/chat/people/people-nav";
import { PeopleSearchView } from "@/components/chat/people/people-search-view";

export const metadata = {
  title: "Люди — справочник общины",
  description:
    "Найдите человека в общине: служение, профессия, навык, город и язык.",
  // Каталог живых людей с городами не должен попадать в поисковики.
  robots: { index: false, follow: false },
};

export default async function PeopleSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Условия поиска отдаём вниз пропом, а не читаем в браузере: иначе выдача
  // рендерится только на клиенте и при прямом заходе по ссылке не появляется.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.append(key, value);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-28">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Люди
        </h1>
        <p className="mt-1 text-sm text-text-1">
          Справочник людей общины: служение, профессия, навык. Здесь ищут
          нужного человека, а не знакомства.
        </p>
      </div>

      {/* Отсюда — к своим запросам, журналу раскрытий и своей карточке. */}
      <PeopleNav />

      <PeopleSearchView query={params.toString()} />
    </main>
  );
}
