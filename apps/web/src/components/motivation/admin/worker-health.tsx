import type { MotivationAdminHealth } from "@vedamatch/shared";

/**
 * Состояние генерации над очередью. Отвечает на единственный вопрос, который
 * задают, когда очередь стоит: воркер жив или нет.
 */
export function MotivationWorkerHealthCard({
  health,
}: {
  health: MotivationAdminHealth | null;
}) {
  if (!health) {
    return (
      <p className="glass mb-4 rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
        Состояние воркера недоступно.
      </p>
    );
  }

  const { worker, queue } = health;

  return (
    <section
      className="glass mb-4 rounded-2xl border border-glass-brd p-4"
      aria-label="Состояние генерации"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold text-text-0">
          Воркер: {worker.alive ? "работает" : "молчит"}
        </span>
        <span className="text-text-1">
          Последний тик:{" "}
          {worker.lastTickAt
            ? new Date(worker.lastTickAt).toLocaleTimeString("ru-RU")
            : "не было"}
        </span>
        <span className="text-text-1">Redis: {worker.redis}</span>
        {worker.running && <span className="text-text-1">тик идёт сейчас</span>}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-text-1">
        <Counter label="Ждут картинку" value={queue.queued} />
        <Counter label="В работе" value={queue.inProgress} />
        <Counter label="Зависли" value={queue.stuck} />
        <Counter label="На проверке" value={queue.awaitingReview} />
        <Counter label="Ошибки" value={queue.failed} />
      </dl>

      {queue.stuck > 0 && (
        <p className="mt-2 text-sm text-text-1">
          Зависшие задачи воркер вернёт в очередь сам на ближайшем тике — до трёх
          попыток, дальше они помечаются ошибкой.
        </p>
      )}

      {worker.lastError && (
        <p className="mt-2 text-sm text-text-1">
          Последняя ошибка тика (
          {new Date(worker.lastError.at).toLocaleString("ru-RU")}):{" "}
          {worker.lastError.message}
        </p>
      )}
    </section>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt>{label}:</dt>
      <dd className="font-mono font-semibold text-text-0">{value}</dd>
    </div>
  );
}
