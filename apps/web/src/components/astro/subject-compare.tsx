"use client";

import { useState } from "react";
import type {
  AstroCompatibilityPurpose,
  AstroSubjectPairDto,
  AstroSubjectRef,
} from "@vedamatch/shared";
import {
  ASTRO_COMPATIBILITY_PURPOSES,
  ASTRO_PURPOSE_TITLES,
  GUNA_MILAN_KOOTA_TITLES,
} from "@vedamatch/shared";
import { AstroReadingError, compareAstroSubjects } from "@/lib/astro-client-api";
import { ASTRO_FIELD } from "./birth-date-field";

/**
 * Сверка этой записи с другой из книги.
 *
 * Согласия не спрашивают и спрашивать не у кого: обе записи принадлежат тому,
 * кто сверяет. Обмен между участниками портала — другой путь, через запрос и
 * принятие; здесь же это собственные заметки астролога.
 */
export function SubjectCompare({
  subjectId,
  others,
}: {
  subjectId: string;
  /** Остальные записи книги: с самим собой сверять нечего. */
  others: AstroSubjectRef[];
}) {
  const [otherId, setOtherId] = useState("");
  const [purpose, setPurpose] = useState<AstroCompatibilityPurpose>("family");
  const [pair, setPair] = useState<AstroSubjectPairDto | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (others.length === 0) {
    return (
      <p className="text-sm text-text-2">
        Сверять пока не с кем — заведите ещё одну карту.
      </p>
    );
  }

  async function compare() {
    if (!otherId) return;
    setPending(true);
    setError(null);
    try {
      setPair(await compareAstroSubjects(subjectId, otherId, purpose));
    } catch (cause) {
      setError(
        cause instanceof AstroReadingError ? cause.message : "Не удалось сверить",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <span className="min-w-[12rem] flex-1">
          <label htmlFor="compare-other" className="block text-sm text-text-2">
            С кем сверяем
          </label>
          <select
            id="compare-other"
            value={otherId}
            onChange={(event) => setOtherId(event.target.value)}
            className={`${ASTRO_FIELD} mt-1.5`}
          >
            <option value="">Выберите карту</option>
            {others.map((other) => (
              <option key={other.id} value={other.id}>
                {other.name}
              </option>
            ))}
          </select>
        </span>

        <span className="min-w-[9rem]">
          <label htmlFor="compare-purpose" className="block text-sm text-text-2">
            Ради чего
          </label>
          <select
            id="compare-purpose"
            value={purpose}
            onChange={(event) =>
              setPurpose(event.target.value as AstroCompatibilityPurpose)
            }
            className={`${ASTRO_FIELD} mt-1.5`}
          >
            {ASTRO_COMPATIBILITY_PURPOSES.map((value) => (
              <option key={value} value={value}>
                {ASTRO_PURPOSE_TITLES[value]}
              </option>
            ))}
          </select>
        </span>

        <button
          type="button"
          disabled={!otherId || pending}
          onClick={() => void compare()}
          className="btn-mint rounded-lg px-5 py-2.5 font-medium disabled:opacity-60"
        >
          {pending ? "Считаем…" : "Сверить"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-magenta">
          {error}
        </p>
      )}

      {pair && (
        <div className="rounded-2xl border border-glass-brd p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium text-text-0">
              {pair.a.name} и {pair.b.name} · {ASTRO_PURPOSE_TITLES[pair.purpose]}
            </p>
            <p className="font-mono text-lg font-bold text-text-0">
              {pair.score.totalPoints}
              <span className="text-text-2"> / {pair.score.maxPoints}</span>
            </p>
          </div>

          <dl className="mt-3 space-y-2">
            {pair.score.kootas.map((koota) => (
              <div
                key={koota.key}
                // Неучтённая кута не исчезает, а гаснет: видно и что её не
                // считают для этой цели, и что она вообще есть.
                className={koota.counted ? "" : "opacity-40"}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-sm text-text-1">
                    {GUNA_MILAN_KOOTA_TITLES[koota.key]}
                  </dt>
                  <dd className="font-mono text-sm text-text-0">
                    {koota.counted
                      ? `${koota.points}/${koota.maxPoints}`
                      : "не считаем"}
                  </dd>
                </div>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-bg-2">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-magenta to-violet"
                    style={{
                      width: koota.counted
                        ? `${(koota.points / koota.maxPoints) * 100}%`
                        : "0%",
                    }}
                  />
                </span>
                {koota.counted && (
                  <p className="mt-0.5 text-xs text-text-2">{koota.note}</p>
                )}
              </div>
            ))}
          </dl>

          {pair.genderUnknown && (
            <p className="mt-3 text-xs text-text-2">
              У одной из карт не указан пол, а склад характера (гана)
              считается по нему — взято более благоприятное из двух направлений
              таблицы. Укажите пол в записи, чтобы счёт стал точным.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
