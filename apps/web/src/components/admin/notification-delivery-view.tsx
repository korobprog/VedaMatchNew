import Link from "next/link";
import type {
  NotificationDeliveryHealthResponse,
  NotificationDeliveryPointDto,
  NotificationDeliveryUserDto,
  NotificationUnreachableUserDto,
} from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import {
  daysAgoLabel,
  deliveryKindLabel,
  deliveryStateLabel,
  deliveryStateTone,
  failureStreakLabel,
  type DeliveryTone,
} from "./delivery-labels";

/** Сроки для второго списка: вечер жалобы, неделя, месяц. */
const WINDOWS = [7, 14, 30];

const TONE_CLASSES: Record<DeliveryTone, string> = {
  // Текст берётся из токенов темы, а рамка и подложка — из акцентов: цвет
  // самого слова остаётся `--vm-text-0`, иначе 12px на стекле уходит ниже 4.5:1.
  ok: "border-cyan/40 bg-cyan/10",
  warn: "border-gold/50 bg-gold/15",
  bad: "border-magenta/50 bg-magenta/15",
};

/**
 * Раздел «Доставка» админки уведомлений (VED-314).
 *
 * Отвечает на два вопроса, ради которых раньше лазили по ssh в базу прода:
 * есть ли у человека живые точки доставки (и когда каждая последний раз
 * принимала пуш) и кому уведомления шли, а доставлять было некуда.
 *
 * Серверный компонент: ничего не нажимается, кроме смены срока — а она
 * обычная ссылка.
 */
export function NotificationDeliveryView({
  report,
}: {
  report: NotificationDeliveryHealthResponse | null;
}) {
  if (!report) {
    return (
      <Alert tone="error">
        Не удалось загрузить состояние доставки уведомлений.
      </Alert>
    );
  }

  const now = new Date();
  const { summary } = report;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-2 font-display text-base font-semibold text-text-0">
          Точки доставки
        </h2>
        <p className="mb-3 text-sm text-text-1">
          «Приняла пуш» — это ответ службы доставки браузера или FCM, а не
          «человек увидел»: браузер, который не открывали месяц, принимает пуш
          так же, как живой. Поэтому подписка, которая месяц не приняла ничего и
          набрала отказы подряд, сначала помечается мёртвой и только через две
          недели удаляется.
        </p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Веб-подписок" value={summary.webTotal} />
          <Stat label="Из них молчат" value={summary.webSilent} />
          <Stat label="Помечены мёртвыми" value={summary.webDead} />
          <Stat label="Телефонов с приложением" value={summary.appTotal} />
          <Stat label="Телефонов помечено" value={summary.appDead} />
          <Stat label="Устройств Telegram" value={summary.telegramTotal} />
          <Stat label="Людей с живой точкой" value={summary.usersReachable} />
          <Stat
            label="Людям доставлять некуда"
            value={summary.usersUnreachable}
          />
        </dl>
      </section>

      <section>
        <h2 className="mb-1 font-display text-base font-semibold text-text-0">
          Кому уведомления шли, а доставлять было некуда
        </h2>
        <p className="mb-3 text-sm text-text-1">
          За {report.windowDays}{" "}
          {plural(report.windowDays, "день", "дня", "дней")}. В список попадает
          только тот, кому уведомления действительно приходили: человек без
          пушей, которому ничего не писали, ничего и не потерял.{" "}
          <WindowLinks current={report.windowDays} />
        </p>
        {report.unreachable.length === 0 ? (
          <p className="text-sm text-text-1">
            Таких нет: каждому, кому шли уведомления, было куда их доставить.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.unreachable.map((person) => (
              <UnreachableRow key={person.userId} person={person} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-display text-base font-semibold text-text-0">
          Люди и их точки доставки
        </h2>
        <p className="mb-3 text-sm text-text-1">
          Сначала те, у кого точки помечены мёртвыми или молчат дольше всех.
        </p>
        {report.people.length === 0 ? (
          <p className="text-sm text-text-1">
            Ни одной точки доставки во всём портале.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {report.people.map((person) => (
              <PersonRow key={person.userId} person={person} now={now} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function WindowLinks({ current }: { current: number }) {
  return (
    <>
      Срок:{" "}
      {WINDOWS.map((days, index) => (
        <span key={days}>
          {index > 0 && " · "}
          {days === current ? (
            <span className="font-semibold text-text-0">{days} дн.</span>
          ) : (
            <Link
              href={`/admin/notifications/delivery?days=${days}`}
              className="text-text-0 underline decoration-magenta/60 underline-offset-2"
            >
              {days} дн.
            </Link>
          )}
        </span>
      ))}
    </>
  );
}

function UnreachableRow({
  person,
}: {
  person: NotificationUnreachableUserDto;
}) {
  return (
    <li className="rounded-2xl border border-glass-brd bg-glass p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link
          href={`/admin/users/${person.userId}`}
          className="font-medium text-text-0 underline decoration-magenta/60 underline-offset-2"
        >
          {person.name}
        </Link>
        <span className="font-mono text-sm text-text-1">
          {person.missed}{" "}
          {plural(person.missed, "уведомление", "уведомления", "уведомлений")}{" "}
          мимо
        </span>
      </div>
      <p className="mt-1 hyphens-auto break-words text-sm text-text-1">
        {person.email}
      </p>
      <p className="mt-1 text-sm text-text-1">
        {person.hasDeadPoints
          ? "Точки доставки есть, но все помечены мёртвыми."
          : "Ни веб-подписок, ни телефонов, ни Telegram."}{" "}
        {person.notificationsEnabled
          ? "Уведомления у человека включены — он их ждёт."
          : "Уведомления человек выключил сам."}
      </p>
    </li>
  );
}

function PersonRow({
  person,
  now,
}: {
  person: NotificationDeliveryUserDto;
  now: Date;
}) {
  return (
    <li className="rounded-2xl border border-glass-brd bg-glass p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link
          href={`/admin/users/${person.userId}`}
          className="font-medium text-text-0 underline decoration-magenta/60 underline-offset-2"
        >
          {person.name}
        </Link>
        <span className="text-sm text-text-1">
          {person.points.length}{" "}
          {plural(person.points.length, "точка", "точки", "точек")} доставки
        </span>
      </div>
      <p className="mt-1 hyphens-auto break-words text-sm text-text-1">
        {person.email}
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {person.points.map((point) => (
          <PointRow key={point.id} point={point} now={now} />
        ))}
      </ul>
    </li>
  );
}

function PointRow({
  point,
  now,
}: {
  point: NotificationDeliveryPointDto;
  now: Date;
}) {
  const streak = failureStreakLabel(point.failureCount);
  return (
    <li className="rounded-xl border border-glass-brd bg-bg-1 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className={cn(
            "rounded-lg border px-2 py-0.5 text-xs text-text-0",
            TONE_CLASSES[deliveryStateTone(point.state)],
          )}
        >
          {deliveryStateLabel(point.state)}
        </span>
        <span className="text-sm text-text-0">
          {deliveryKindLabel(point.kind)}: {point.label}
        </span>
      </div>
      <p className="mt-1 text-sm text-text-1">
        Приняла пуш: {daysAgoLabel(point.lastSuccessAt, now)}
        {" · "}
        Клиент подтверждал: {daysAgoLabel(point.lastSeenAt, now)}
        {streak ? ` · ${streak}` : ""}
        {point.deadSince
          ? ` · помечена ${daysAgoLabel(point.deadSince, now)}`
          : ""}
      </p>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-glass-brd bg-glass p-3">
      <dt className="hyphens-auto break-words text-xs text-text-1">{label}</dt>
      <dd className="font-mono text-xl text-text-0">{value}</dd>
    </div>
  );
}
