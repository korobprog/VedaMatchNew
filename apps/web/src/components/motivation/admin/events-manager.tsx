"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { MotivationEventDto } from "@vedamatch/shared";
import { apiRequest } from "../motivation-admin-api";
import { cardClass, dangerButton, fieldClass, labelClass, primaryButton } from "./ui";

/**
 * Справочник праздников для открыток. Дата хранится в конкретном году: лунный
 * календарь смещается, и «каждое 19 августа» было бы неправдой.
 */
export function EventsManager({ events }: { events: MotivationEventDto[] | null }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [greeting, setGreeting] = useState("");
  const [leadDays, setLeadDays] = useState(3);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiRequest("/admin/motivation/events", "POST", {
        date,
        title,
        greeting: greeting.trim() || null,
        leadDays,
      });
      setTitle("");
      setGreeting("");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не сохранилось");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiRequest(`/admin/motivation/events/${id}`, "DELETE");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалилось");
    }
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={(event) => void submit(event)} className={`${cardClass} grid gap-3`}>
        <h2 className="font-display text-lg font-semibold text-text-0">Новое событие</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Дата
            <input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          <label className={labelClass}>
            Название
            <input
              required
              maxLength={80}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Джанмаштами"
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          <label className={labelClass}>
            Текст на открытке
            <input
              maxLength={120}
              value={greeting}
              onChange={(event) => setGreeting(event.target.value)}
              placeholder="С Джанмаштами"
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          <label className={labelClass}>
            Показывать заранее, дней
            <input
              type="number"
              min={0}
              max={60}
              value={leadDays}
              onChange={(event) => setLeadDays(Number(event.target.value))}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Сохраняем…" : "Добавить событие"}
        </button>
        <p className="text-xs text-text-2">
          Пустой текст на открытке заменяется названием. За указанное число дней до даты кнопка
          «Сделать открытку» появляется у постов, а в день праздника — и в ленте.
        </p>
      </form>

      {events && events.length > 0 ? (
        <ul className="grid gap-2">
          {events.map((event) => (
            <li key={event.id} className={`${cardClass} flex flex-wrap items-center gap-3`}>
              <span className="font-mono text-sm text-text-0">{event.date}</span>
              <span className="font-semibold text-text-0">{event.title}</span>
              {event.greeting && <span className="text-sm text-text-1">«{event.greeting}»</span>}
              <span className="text-xs text-text-2">за {event.leadDays} дн.</span>
              {!event.enabled && <span className="text-xs text-text-2">выключено</span>}
              <button
                type="button"
                onClick={() => void remove(event.id)}
                className={`${dangerButton} ml-auto`}
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${cardClass} text-sm text-text-1`}>
          Событий пока нет. Без них открытки не предлагаются.
        </p>
      )}
    </div>
  );
}
