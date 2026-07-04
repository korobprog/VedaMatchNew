import type { ServiceCard as ServiceCardType } from "@vedamatch/shared";

const categoryEmoji: Record<string, string> = {
  community: "🤝",
  knowledge: "📖",
  lifestyle: "🌱",
};

export function ServiceCard({ service }: { service: ServiceCardType }) {
  const comingSoon = service.status === "coming_soon";

  return (
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-2xl dark:bg-amber-950">
          {service.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={service.iconUrl} alt="" className="h-8 w-8" />
          ) : (
            (categoryEmoji[service.category] ?? "✨")
          )}
        </span>
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            {service.name}
          </h3>
          {comingSoon && (
            <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Скоро
            </span>
          )}
        </div>
      </div>
      <p className="mb-6 flex-1 text-sm text-zinc-600 dark:text-zinc-400">
        {service.description}
      </p>
      {comingSoon ? (
        <button
          disabled
          className="w-full cursor-not-allowed rounded-xl bg-zinc-100 py-3 text-sm font-medium text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
        >
          В разработке
        </button>
      ) : (
        <a
          href={service.url}
          className="w-full rounded-xl bg-amber-600 py-3 text-center text-sm font-medium text-white transition hover:bg-amber-700"
        >
          Открыть
        </a>
      )}
    </div>
  );
}
