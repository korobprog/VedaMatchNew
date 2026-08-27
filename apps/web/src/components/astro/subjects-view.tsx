"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type {
  AstroSubjectDto,
  GeoSearchResult,
  SaveAstroSubjectRequest,
} from "@vedamatch/shared";
import { ASTRO_SUBJECT_NOTES_MAX } from "@vedamatch/shared";
import {
  AstroReadingError,
  createAstroSubject,
  deleteAstroSubject,
  listAstroSubjects,
  updateAstroSubject,
} from "@/lib/astro-client-api";
import { EMPTY_PARTS, birthDateProblem, toParts, type BirthDateParts } from "./birth-date";
import { ASTRO_FIELD, BirthDateField } from "./birth-date-field";
import { PlaceField } from "./place-field";
import { formatUtcOffset } from "./utc-offset";

/**
 * Книга карт астролога: люди, которых он ведёт.
 *
 * Своей карты в списке нет и быть не может — она живёт отдельно. Здесь только
 * записи о других, и видны они лишь владельцу: обмена через них нет, а если
 * человек тоже участник портала, карты сверяются обычным путём, по взаимному
 * согласию.
 */

interface Draft {
  name: string;
  gender: "" | "male" | "female";
  date: BirthDateParts;
  time: string;
  timeUnknown: boolean;
  placeQuery: string;
  place: GeoSearchResult | null;
  notes: string;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  gender: "",
  date: EMPTY_PARTS,
  time: "",
  timeUnknown: false,
  placeQuery: "",
  place: null,
  notes: "",
};

function draftOf(subject: AstroSubjectDto): Draft {
  return {
    name: subject.name,
    gender: subject.gender ?? "",
    date: toParts(subject.birthDate),
    time: subject.birthTime ?? "",
    timeUnknown: subject.timeAccuracy === "unknown",
    placeQuery: subject.place.label,
    place: {
      city: subject.place.label,
      lat: subject.place.latitude,
      lon: subject.place.longitude,
    },
    notes: subject.notes ?? "",
  };
}

export function SubjectsView({ initial }: { initial: AstroSubjectDto[] }) {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** id правимой записи; null — заводим новую. */
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(subject?: AstroSubjectDto) {
    setError(null);
    setEditing(subject?.id ?? null);
    setDraft(subject ? draftOf(subject) : EMPTY_DRAFT);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;

    if (!draft.place) {
      setError("Выберите место рождения из подсказок.");
      return;
    }
    const dateProblem = birthDateProblem(draft.date, new Date());
    if (dateProblem) {
      setError(dateProblem);
      return;
    }

    const body: SaveAstroSubjectRequest = {
      name: draft.name,
      birthDate: `${draft.date.year}-${draft.date.month}-${draft.date.day}`,
      birthTime: draft.timeUnknown ? null : draft.time || null,
      timeAccuracy: draft.timeUnknown ? "unknown" : "exact",
      gender: draft.gender || null,
      place: {
        label: draft.placeQuery.trim(),
        latitude: draft.place.lat,
        longitude: draft.place.lon,
      },
      notes: draft.notes,
    };

    setPending(true);
    setError(null);
    try {
      if (editing) await updateAstroSubject(editing, body);
      else await createAstroSubject(body);
      setItems((await listAstroSubjects()).items);
      setDraft(null);
      setEditing(null);
    } catch (cause) {
      setError(
        cause instanceof AstroReadingError
          ? cause.message
          : "Не удалось сохранить запись",
      );
    } finally {
      setPending(false);
    }
  }

  async function remove(subject: AstroSubjectDto) {
    // Данные рождения восстановить неоткуда — переспрашиваем.
    if (!window.confirm(`Удалить запись «${subject.name}»?`)) return;
    setPending(true);
    try {
      await deleteAstroSubject(subject.id);
      setItems((await listAstroSubjects()).items);
    } catch (cause) {
      setError(
        cause instanceof AstroReadingError ? cause.message : "Не удалось удалить",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="text-sm font-medium text-magenta">
          {error}
        </p>
      )}

      {draft === null ? (
        <button
          type="button"
          onClick={() => open()}
          className="btn-mint rounded-lg px-5 py-2.5 font-medium"
        >
          Добавить карту
        </button>
      ) : (
        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-glass-brd p-4"
        >
          <div>
            <label htmlFor="subject-name" className="block text-sm font-medium text-text-0">
              Чья карта
            </label>
            <input
              id="subject-name"
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Имя или ФИО"
              className={`${ASTRO_FIELD} mt-1.5`}
            />
          </div>

          <div>
            <label
              htmlFor="subject-gender"
              className="block text-sm font-medium text-text-0"
            >
              Пол
            </label>
            <select
              id="subject-gender"
              value={draft.gender}
              onChange={(e) =>
                setDraft({ ...draft, gender: e.target.value as Draft["gender"] })
              }
              className={`${ASTRO_FIELD} mt-1.5`}
            >
              <option value="">Не указан</option>
              <option value="female">Женский</option>
              <option value="male">Мужской</option>
            </select>
            {/* Не косметика: гана-кута считается по полу, и без него сверка
                берёт более благоприятный вариант — счёт выходит завышенным. */}
            <p className="mt-1.5 text-xs text-text-2">
              Нужен для гана-куты при сверке карт. Без него счёт берётся по
              благоприятному варианту.
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-text-0">Дата рождения</legend>
            <div className="mt-1.5">
              <BirthDateField
                idPrefix="subject"
                value={draft.date}
                onChange={(date) => setDraft({ ...draft, date })}
              />
            </div>
          </fieldset>

          <div>
            <label htmlFor="subject-place" className="block text-sm font-medium text-text-0">
              Место рождения
            </label>
            <div className="mt-1.5">
              <PlaceField
                id="subject-place"
                query={draft.placeQuery}
                onQueryChange={(placeQuery) =>
                  setDraft({ ...draft, placeQuery, place: null })
                }
                onPick={(place) =>
                  setDraft({
                    ...draft,
                    place,
                    placeQuery: place.displayName ?? place.city,
                  })
                }
              />
            </div>
          </div>

          <div>
            <label htmlFor="subject-time" className="block text-sm font-medium text-text-0">
              Время рождения
            </label>
            <input
              id="subject-time"
              type="time"
              disabled={draft.timeUnknown}
              value={draft.time}
              onChange={(e) => setDraft({ ...draft, time: e.target.value })}
              className={`${ASTRO_FIELD} mt-1.5 disabled:opacity-50`}
            />
            <label className="mt-2 flex min-h-[24px] items-center gap-2 text-sm text-text-1">
              <input
                type="checkbox"
                checked={draft.timeUnknown}
                onChange={(e) =>
                  setDraft({ ...draft, timeUnknown: e.target.checked })
                }
              />
              Время неизвестно
            </label>
          </div>

          <div>
            <label htmlFor="subject-notes" className="block text-sm font-medium text-text-0">
              Заметки
            </label>
            <textarea
              id="subject-notes"
              rows={3}
              maxLength={ASTRO_SUBJECT_NOTES_MAX}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="О чём говорили, на что обратить внимание"
              className={`${ASTRO_FIELD} mt-1.5`}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="btn-mint rounded-lg px-5 py-2.5 font-medium disabled:opacity-60"
            >
              {pending ? "Сохраняем…" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg border border-glass-brd px-4 py-2.5 text-text-1"
            >
              Отмена
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-text-2">
          Пока пусто. Здесь хранятся карты людей, которых вы ведёте: имя, дата,
          время и место рождения. Записи видите только вы.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((subject) => (
            <li
              key={subject.id}
              className="rounded-2xl border border-glass-brd p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                {/* Имя — ссылка на карту: ради неё запись и заводят. */}
                <Link
                  href={`/astro/subjects/${subject.id}`}
                  className="font-medium text-text-0 underline-offset-4 hover:underline"
                >
                  {subject.name}
                </Link>
                <span className="flex gap-2 text-sm">
                  <Link
                    href={`/astro/subjects/${subject.id}`}
                    className="text-text-2 underline underline-offset-4 hover:text-text-0"
                  >
                    Карта
                  </Link>
                  <button
                    type="button"
                    onClick={() => open(subject)}
                    className="text-text-2 underline underline-offset-4 hover:text-text-0"
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void remove(subject)}
                    className="text-text-2 underline underline-offset-4 hover:text-magenta disabled:opacity-50"
                  >
                    Удалить
                  </button>
                </span>
              </div>

              <p className="mt-1 text-sm text-text-1">
                {subject.birthDate}
                {subject.birthTime ? `, ${subject.birthTime}` : ", время неизвестно"}
                {" · "}
                {subject.place.label}
              </p>
              <p className="mt-0.5 text-xs text-text-2">
                {subject.timezone}, {formatUtcOffset(subject.utcOffsetMinutes)}
              </p>

              {subject.nonexistentLocalTime && (
                <p className="mt-1 text-xs text-gold">
                  В этот день там переводили стрелки, и указанного часа не
                  существовало — карта считается со сдвигом на час вперёд.
                </p>
              )}

              {subject.notes && (
                <p className="mt-2 whitespace-pre-line text-sm text-text-1">
                  {subject.notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
