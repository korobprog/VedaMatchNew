import type { UnionActivityLevel } from "@vedamatch/shared";

const activityLabels: Record<UnionActivityLevel, string> = {
  online: "В сети",
  today: "Был(а) сегодня",
  week: "Был(а) на этой неделе",
  long_ago: "Давно не заходил(а)",
};

/** Огрублённая активность профиля — показываем только свежие визиты. */
export function ActivityBadge({
  activity,
  variant = "inline",
}: {
  activity: UnionActivityLevel | null;
  variant?: "inline" | "overlay";
}) {
  if (!activity || activity === "long_ago") return null;

  const fresh = activity === "online";

  return (
    <span
      data-testid="activity-badge"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full text-xs font-medium ${
        variant === "overlay"
          ? "bg-black/55 px-2 py-1 text-white"
          : "border border-glass-brd px-2 py-0.5 text-text-1"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${
          fresh ? "bg-cyan shadow-[0_0_8px_var(--vm-glow-cyan)]" : "bg-text-2"
        }`}
      />
      {activityLabels[activity]}
    </span>
  );
}
