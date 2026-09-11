import type { Metadata } from "next";
import type { PortalSearchResponse } from "@vedamatch/shared";
import { Header } from "@/components/header";
import { PortalSearchField } from "@/components/portal-search-field";
import { AssistantLinkCardView } from "@/components/assistant/assistant-cards";
import { serviceLabel } from "@/components/assistant/assistant-share";
import { getProfile } from "@/lib/api";
import { getPortalSearch } from "@/lib/assistant-api";
import { redirectToLogin } from "@/lib/require-user";

export const metadata: Metadata = {
  title: "Поиск",
  robots: { index: false, follow: false },
};

/**
 * Выдача поиска по порталу (VED-75): находки всех сервисов, которые умеют
 * искать, группами по сервису. Собирает её один портальный запрос
 * `/assistant/search` — страница не ходит в сервисы сама, см.
 * docs/service-module-contract.md.
 *
 * Запрос живёт в адресе: выдачу можно переслать, а «назад» из найденного
 * материала возвращает сюда же.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? "";
  const user = await getProfile();
  if (!user) {
    redirectToLogin(raw ? `/search?q=${encodeURIComponent(raw)}` : "/search");
  }

  // `undefined` — поиск упал; ошибка одного запроса не должна ронять
  // страницу с полем, где запрос можно повторить.
  const result = raw
    ? await getPortalSearch(raw).catch(() => undefined)
    : undefined;

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="mb-4 font-display text-2xl font-bold text-text-0">
          Поиск по VedaMatch
        </h1>
        <PortalSearchField
          defaultValue={raw}
          autoFocus={!raw}
          className="mb-6"
        />
        <SearchResults query={raw} result={result} />
      </main>
    </div>
  );
}

function SearchResults({
  query,
  result,
}: {
  query: string;
  result: PortalSearchResponse | null | undefined;
}) {
  if (!query) {
    return (
      <p className="text-sm text-text-2">
        Ищет сразу по Образованию, Библиотеке, Музыке, Вдохновению,
        Объявлениям, Рынку и Здоровью.
      </p>
    );
  }
  if (!result) {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
        Поиск сейчас недоступен. Попробуйте ещё раз через минуту.
      </p>
    );
  }
  if (result.query === null) {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
        Слишком короткий запрос — нужно хотя бы два символа.
      </p>
    );
  }

  // Молчавшие сервисы называются прямо: без этого «ничего не нашлось»
  // нельзя отличить от «Рынок не успел ответить».
  const unavailable =
    result.unavailable.length > 0 ? (
      <p className="text-xs text-text-2">
        Не успели ответить: {result.unavailable.map(serviceLabel).join(", ")}.
        Повторите поиск чуть позже — там могли найтись ещё материалы.
      </p>
    ) : null;

  if (result.groups.length === 0) {
    return (
      <div className="grid gap-3">
        <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
          По запросу «{result.query}» ничего не нашлось. Попробуйте другое
          слово или запрос короче.
        </p>
        {unavailable}
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      {result.groups.map((group) => (
        <section
          key={group.service}
          aria-labelledby={`search-group-${group.service}`}
        >
          <h2
            id={`search-group-${group.service}`}
            className="mb-3 font-display text-lg font-semibold text-text-0"
          >
            {serviceLabel(group.service)}
          </h2>
          <div className="grid gap-3">
            {group.items.map((card, index) => (
              <AssistantLinkCardView key={`${card.href}-${index}`} card={card} />
            ))}
          </div>
        </section>
      ))}
      {unavailable}
    </div>
  );
}
