import type { ServiceCard as ServiceCardType } from "@vedamatch/shared";

const categoryEmoji: Record<string, string> = {
  community: "🤝",
  knowledge: "📖",
  lifestyle: "🌱",
};

export function ServiceCard({
  service,
  badgeCount,
}: {
  service: ServiceCardType;
  badgeCount?: number;
}) {
  const comingSoon = service.status === "coming_soon";

  return (
    <div className="group flex flex-col rounded-2xl glass border border-glass-brd p-6 transition-all duration-300 hover:-translate-y-1 hover:border-magenta/30 hover:shadow-[0_0_20px_rgba(255,62,158,0.15)]">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-glass text-2xl border border-glass-brd">
          {service.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={service.iconUrl} alt="" className="h-8 w-8" />
          ) : (
            (categoryEmoji[service.category] ?? "✨")
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-text-0">
            {service.name}
          </h3>
          {comingSoon && (
            <span className="inline-block rounded-full bg-glass px-2 py-0.5 text-xs font-medium text-text-1 mt-1">
              Скоро
            </span>
          )}
          {service.requiresDevoteeVerification && (
            <span className="mt-1 inline-block rounded-full bg-magenta/20 px-2 py-0.5 text-xs font-medium text-magenta border border-magenta/30">
              Подтвержденный преданный
            </span>
          )}
        </div>
        {(badgeCount ?? 0) > 0 && (
          <span
            aria-label={`Входящих заявок: ${badgeCount}`}
            className="self-start rounded-full bg-magenta px-2.5 py-1 text-xs font-semibold text-white"
          >
            {badgeCount}
          </span>
        )}
      </div>
      <p className="mb-6 flex-1 text-sm text-text-1">
        {service.description}
      </p>
      {comingSoon ? (
        <button
          disabled
          className="w-full cursor-not-allowed rounded-xl bg-glass px-4 py-3 text-sm font-medium text-text-2"
        >
          В разработке
        </button>
      ) : (
        <a
          href={service.url}
          className="w-full rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] py-3 text-center text-sm font-medium text-white transition hover:shadow-[0_0_20px_rgba(255,62,158,0.4)]"
        >
          Открыть
        </a>
      )}
    </div>
  );
}
